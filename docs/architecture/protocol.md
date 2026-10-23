# 프로토콜 — 도구 계약과 보드 규약

에이전트가 서비스에 말을 거는 방법(MCP 도구)과 보드 항목이 지켜야 하는 기록 규약을
한곳에 둔다. 왜 이래야 하는지는 [invariants.md](./invariants.md)에 있다.

## 템플릿 다운로드 — `GET /api/templates`

`/harness:init`은 `Authorization: Bearer <토큰>`과 `lang` 쿼리(생략 시 `en`)로 템플릿을 요청한다.
서버는 토큰 인증 → **프로젝트 확정** → 프로젝트 접근 확인 → 단기 요청 제한 → 언어별 템플릿 조회 순으로 처리한다.
인증이나 접근 확인에 실패하면 템플릿을 조회하지 않는다.

**토큰 두 종류를 받는다.** 에이전트 토큰(`hs_`)은 프로젝트를 스스로 알고 있어 쿼리 인자가 필요 없다 —
보내도 무시된다. 사용자 토큰(`hu_`)은 사람에게만 묶이므로 `?project=<slug>`가 **필수**이고, 서버는
호출마다 그 슬러그가 호출자 소유인지 확인한다(`ownerUserId` 일치). 소유자 토큰(`ho_`)은 여기서도 거부한다.

| 상태 | 의미 |
| --- | --- |
| `200` | `{ templates, entitlement: { plan, agents } }`. 에이전트는 스텁, 보고 에이전트·런북은 플랜에 맞춰 제공 |
| `401` | 토큰 누락·형식 오류·미등록·폐기. 소유자 토큰도 허용하지 않음. **`hu_`인데 `?project=`가 없으면 여기다** — `project required: send harness.json project.slug as project on every request. If the slug is missing, recover it with /harness:init; if it is already set, update the harness plugin or include project in the MCP call.` |
| `403` | 인증은 성공했지만 프로젝트가 해제되었거나 선택되지 않았거나 소유권이 불완전함. 응답의 `error`에 사유 보존. **`hu_`가 남의 슬러그를 가리키면 `not the owner of this project`** — 없는 슬러그도 같은 문장이다 |
| `404` | 요청한 언어의 템플릿이 없음 |
| `429` | 계정 또는 프로젝트의 10분 요청 한도 도달. `{ error, code: "RATE_LIMITED", retryAfterSec }`와 `Retry-After` 정수 초 |

401/403/404는 `{ error: string }`이고, 429는 위 제한 metadata를 포함한다. 만료 토큰도 폐기 토큰과 같은 401이다. MCP 도구의 `isError` 응답과 별개의 HTTP 계약이다.

## 프로젝트 정체 — `GET /api/project`

`/harness:init`이 `harness.json` 초안의 `project` 블록을 채울 때 `Authorization: Bearer <에이전트 토큰>`으로
요청한다. 서버는 토큰 인증 → 프로젝트 접근 확인 → 단기 요청 제한 → 정체 조회 순으로 처리한다. 인증이나 접근 확인에
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
| `403` | 인증은 성공했지만 프로젝트가 해제되었거나 선택되지 않았거나 소유권이 불완전함. 응답의 `error`에 사유 보존 |

언어에 매이지 않으므로 `404`가 없다. 구버전 서버에는 이 경로 자체가 없어 플러그인이 404를 받고,
그때는 사용자에게 `owner`·`repo`·`branch`를 물어 진행한다. 위 4xx 응답은 `{ error: string }`이다.

## 프로젝트 사용 상태

`project_get`은 기존 repository owner 키를 보존하고 `available: true` 또는 `available: false, reason`을
추가한다. ownerUserId/repoOwner/선택·sync 시각은 공개 body에 노출하지 않는다. 소유권 무결성 오류라면
프로젝트 상세 없이 error만 응답한다. selected-out에서 나머지 13개 agent 도구는 domain query 전에 거부한다.

공통 사유: `This project is not selected for use. Open Stagekeeper → Projects and choose “Use this project”.`
토큰 인증은 유지하며 다른 도구나 templates/runbook 접근으로 우회할 수 없다.
연결 해제는 별도 상태다. 유효한 hu_로 자기 프로젝트를 지정해도 `project_get`을 포함한 agent 15개와
owner `gate_approve`가 domain 호출 전에 `{ error }`만 반환한다. 정확한 사유는
`This repository is disconnected. Open Stagekeeper → Projects and choose Reconnect repository.`다.
인증 → 호출자 프로젝트 범위 → 접근 상태 → domain 순서를 유지한다. 해제 시 폐기된 hs_/ho_는 일반 401로
거부하며 해제 사유나 repository 정보를 노출하지 않는다. hu_의 소유 범위 조회에서 해제된 행을 숨기지 않는다.
`project_sync` 성공은 Workspace/language/lastSyncedAt을 같은 transaction에 저장한다. 거부·실패는 모두 불변이다.
`POST /api/runbook`은 같은 access와 단기 요청 제한 이후 12자리 소문자 hex version을 검사한다. 실패 상태는 401/403/400/429,
성공 body는 `{ ok: true }`다. 이 요청은 lastSyncedAt을 변경하지 않는다. 이 경로에는 쿼리 문자열이 없으므로
`hu_`는 프로젝트를 **본문**으로 준다(`{ version, project }`) — 없으면 401(`project required: …`)이다.

## 저장소 등록·연결 전이

`POST /api/projects`는 hu_ 인증과 동일 소유자 repository의 대소문자 비교를 transaction 안에서 수행한다.
연결된 기존 repo는 저장된 실제 slug를 반환하고 새 행이나 토큰을 만들지 않는다. 해제된 기존 repo는
409 `{ error: <해제 사유>, reconnectPath: "/p/<실제 slug>" }`로 웹 재연결을 안내한다. cap·무결성 등
다른 도메인 실패는 `{ error }`만 반환한다. 등록은 인증 후 계정 단기 한도만 집계하고, 429는 제한 metadata와 Retry-After를 포함한다. 중복 repo가 2개 이상이면 임의로 하나를 골라 URL을 노출하지 않는다.
새 등록 한도는 연결된 개수다. 다운그레이드로 초과한 연결 기록은 보존한다.

disconnect/reconnect는 bearer REST/MCP가 아니라 requireUser로 인증한 웹 Server Action 두 개다.
입력은 targetProjectId와 expectedVersion이며 userId는 세션에서만 얻는다. 최신 버전의 반복은 no-op,
오래된 버전은 no-op 전에 stale이다. 서버 스위치가 꺼져도 기존 해제 상태의 접근 차단은 유지한다.
웹 상세 7개 GET과 History는 소유자의 보존 기록 조회 경로다. 전체 계약은
[repository-disconnection.md](./repository-disconnection.md)를 따른다.

플러그인 0.3.6은 응답의 실제 사유와 소유자 reconnectPath를 보존한다. 401/403/409를 offline이나 404
호환 경로로 우회하지 않는다. templates 거부는 파일 생성 전에 중단하고, 이미 허용된 파일 생성 뒤
runbook 거부는 생성 파일을 보존하되 후속 MCP 등록·sync·성공 보고를 중단하도록 경고한다.

## MCP 도구 계약 — 에이전트 토큰 스코프

서버 이름 `harness`. Claude Code에서 보이는 이름은 `mcp__harness__<tool>`. 도구명은 밑줄(점 금지 — 클라이언트 정규화 회피).

**프로젝트는 토큰이 아니라 인자에서 온다.** 아래 15개 도구 전부가 선택 입력 `project`(슬러그)를 받는다.
`hs_`는 토큰이 프로젝트를 알고 있어 이 값을 보지 않으므로 **기존 호출이 그대로 통한다**. `hu_`는 이 값이
**필수**다 — 없으면 `project required: send harness.json project.slug as project on every request. If the slug is missing, recover it with /harness:init; if it is already set, update the harness plugin or include project in the MCP call.`,
호출자 소유가 아니면 `not the owner of this project`로 거부한다(없는 슬러그도 같은 문장이다).
판정은 `src/server/mcp/tools.ts`의 `scope()` 한 곳이고, 소유자 서버는 `hu_`를 받지 않는다.

클라이언트의 프로젝트 출처는 현재 checkout의 `harness.json.project.slug`다. init 생성기는 템플릿 쿼리와
런북 보고 본문에 이를 전달하며, `hu_`에 slug가 없으면 네트워크·파일 쓰기 전에 중단한다. init 스킬의
`project_get`·`project_sync`도 같은 값을 보낸다. 런북의 메인 루프가 파일에서 읽고 에이전트 briefing에
전달한다. 파일 도구가 없는 PM도 첫 `agent_next`부터 이를 사용할 수 있어야 한다. 모든 에이전트는
첫 호출·재개·outcome·보고에 같은 `project`를 넣는다. slug 없는 `hs_`는 메인 루프가 그 호환 경로를
명시한 경우에만 인자를 생략한다. `harness_owner`의 소유자 토큰 계약은 별개다.

MCP의 공통 `project` 필드 설명은 `hu_`에서 매 호출 필수라는 점과 설정 출처를 명시한다. `optional`은
`hs_` 하위호환을 위한 스키마이며, 사용자 토큰의 요구사항을 완화하지 않는다.

이 경계의 회귀 검사는 `src/server/rest/harness-init.test.ts`다. 실제 CLI를 로컬 HTTP 서버와 연결하고
`makeTemplatesFor`·`makeRecordRunbook`의 실제 인증·스코프 코드를 실행한다. DB IO만 대체하며
`npm run test:web`을 통해 CI에서 검사한다. 토큰 하나로 두 checkout을 연결하는 경우, 플랜별 첫 생성·재실행,
slug 누락, `hs_` 호환, dry-run 무쓰기, 타 프로젝트 거부를 포함한다. private 템플릿 검사는
`npm run test:templates`로 런북·모든 스텁·단계·안내 문서의 호출 예시와 플랜별 배포 결과를 확인한다.

플러그인과 템플릿은 별도 배포 단위다. `plugin/.claude-plugin/plugin.json`의 버전을 올린 플러그인을
배포하는 것만으로 DB의 `Template` 본문이 바뀌지 않는다. private 템플릿 저장소의 변경도 반영하고
검증한 원본을 `npm run seed:templates`로 대상 DB에 게시해야 한다. 이후 사용자 플러그인을 업데이트하고
init을 재실행해 런북과 관리 스텁을 갱신한다. 새 템플릿 변수는 추가하지 않아 구버전 렌더러와도 호환된다.
`skip(modified)` 파일은 보존하고 별도 조정 대상으로 알린다. 운영 완료는 실제 응답 본문과 생성물의
프로젝트 전달 지침, `project_get`·`project_sync` 성공까지 확인한 뒤 판단한다.

실제 보호 요청은 계정 1,200회·프로젝트 300회/10분으로 제한한다. 각 subject의 첫 허용 요청이
구간을 시작한다. 15개 agent 도구·owner `gate_approve`·다섯 REST 경로에 인증/소유 범위/공통
접근·owner 플랜 판정 뒤 한 번 적용한다. 등록은 계정만 센다. SDK schema 거부·초기화·목록·
접근 거부는 제외하고 이후 도메인 실패는 센다. selected-out의 허용된 `project_get`도 센다.
DB의 account → project 잠금 아래 함께 증가하며 거부 시 생성/reset/증가를 모두 rollback한다.
REST 429는 `{error, code:"RATE_LIMITED", retryAfterSec}`와 `Retry-After`를 반환하고 MCP는 같은
JSON을 `isError:true`의 text content에 담는다. init은 자동 재시도하지 않는다. runbook 보고 429는
이미 생성한 파일을 보존하고 대기 안내와 exit 1을 반환한다. 기존 runbook 401/403은 exit 0을 유지한다.

제품 사용량은 별도로 소유 계정 전체의 **새 AgentRun**을 첫 커밋부터 5시간 동안 센다.
Free 20회·Pro 100회·Max 무제한이며 Max도 저장 counter를 유지한다. User 잠금과 생성 transaction
안에서 DB UTC 시각을 읽고 counter·anchor·run을 함께 저장한다. 기존 run 재개·완료는 소진 후에도
가능하다. rollback은 집계되지 않고 커밋 뒤 실패·종료·삭제는 환급하지 않는다. 만료된 구간은 읽기에서
0%로 해석하고 다음 신규 run에서 다시 시작한다. `/billing`은 plan과 퍼센트를 같은 snapshot으로 읽는다.
`USAGE_LIMIT_REACHED`에는 `resetAt`을 전달하며 30일 History 조회 정책은 그대로 유지한다.

hs_/ho_/hu_는 선택적 `expiresAt`이 null이면 무기한이고 `at >= expiresAt`이면 인증 거부한다.
credential 조회 뒤 한 번 캡처한 `at`을 유효성 판정과 awaited lastUsed recorder에 함께 쓴다.
MCP `AuthInfo.expiresAt`의 초 단위 재검사는 사용하지 않는다. 다음 HTTP 요청은 다시 인증한다.
이름 변경은 label만 수정하며 프로젝트 토큰은 User 잠금 뒤 최신 가용성을 확인한다.

| 도구 | 입력 | 효과 | 누가 | Phase |
| --- | --- | --- | --- | --- |
| `project_get` | `{project?}` | 프로젝트·roster·워크스페이스 | 전부 | 1 |
| `project_sync` | `{workspaces[], language?, project?}` (= `harness.json`의 `workspaces`·`language`) | 워크스페이스 upsert(roster 갱신) · `Project.language` 갱신(`agent_next`가 단계를 찾는 언어) | init 스킬 | 1 · 4 |
| `backlog_list` | `{includeRemoved?, project?}` | 백로그 항목 + 최신 보드 status | pm·dev·doc-auditor·feature-scout | 1 |
| `backlog_add` | `{runId, title, area, source, type, project?}` | 서버가 ITEM-NN 발급. 열린 feature-scout run만, run당 누적 3건·플랜의 live 상한. 반환 `{key}` | feature-scout | 1 |
| `backlog_get` | `{key, project?}` | 항목 1건(`source` 전문) | dev·impl-verifier·qa-verifier | 1 |
| `board_list` | `{open?, project?}` | 항목별 **최신** 보드 행 | pm·dev·main-loop·plan-verifier | 1 |
| `board_get` | `{key, project?}` | 최신 보드 행 + 전이 이벤트 + 보고. 이벤트에 `channel` 포함(사람 행: web \| session, 나머지 null) | dev·plan-verifier·impl-verifier·qa-verifier·main-loop | 1 |
| `board_propose` | `{key, agent, reason, project?}` | `proposed` 행 생성. **거부**: 미결 ≥ 2, agent가 roster 밖, reason > 150자, 이미 미결인 key, 최신 행이 `on_hold`인 key | pm | 1 |
| `board_transition` | `{key, to, result?, project?}` | 에이전트는 planning·implementing에서 on_hold만 요청한다(§ `transitions.mjs`). `result` ≤ 150, 누적. `in_review`는 `plan_submit`으로 전이하며 `done`은 구현 구간 완료 증거를 확인한 pipeline이 기록한다 | dev | 1 |
| `plan_submit` | `{key, path, commit, type?, project?}` | 계획서 위치 기록 — **`planning`·`in_review`에서만**. 검증 라운드가 계획서를 고치면 재호출해 승인 대상 커밋을 갱신한다. **게이트②가 승인하는 것은 이 커밋이다** — 소유자 편집도 커밋·재제출로 기록에 올린다 | dev·main-loop | 1 |
| `report_submit` | `{key, actor, path, commit, runId?, project?}` | 행위자 기록 위치 — **`in_review`·`implementing`·`done`에서만**(검증 라운드·구현 보고·인수 기록). `done`에서 `main-loop`의 보고가 **인수 기록**이다 — 서버가 그 시각을 `BoardItem.acceptedAt`에 적는다 | dev·impl-verifier·qa-verifier·main-loop | 1 |
| `acceptance_fail` | `{key, checks, note, path?, commit?, project?}` | 최신 done·미인수·열린 accept 노드에 실패 조건 1–5(각각 한 번)와 150자 이하 note를 기록한다. path/commit은 함께 선택 입력. Failure는 Report와 별개이며 같은 상태 이벤트 `acceptance-failed`를 남긴다. 중복 실패는 거부하고 cursor·acceptedAt·backlog는 보존한다 | main-loop | 1 |
| `validation_record` | `{key, text, project?}` | `validation` — **`in_review`일 때만**. 되돌리기 시 서버가 지움. **마지막 `plan_submit` 뒤에 `plan-verifier`의 `verify` ok 원장이 없으면 거부**(`no plan-verifier pass recorded after the last plan_submit — …`) | main-loop | 1 |
| `agent_next` | `{agent, key?, outcome?, note?, entry?, agentRunId?, stepId?, receipt?, project?}` | 에이전트 템플릿의 **다음 단계 하나**(`{step, instruction, receipt:{runId,revision,stepId}, done:false}` / `{done:true}`). 단계 본문은 이 도구로만 나간다 — 파일(`.claude/agents/*.md`)은 스텁이다. **새 run은 `requires`가 맞는 첫 단계로 열린다**(실패 분기 전용 단계는 진입 후보가 아니다) — 그래서 보드 상태로 갈리는 에이전트도 스스로 분기하는 단계를 둘 필요가 없다. 열리는 단계가 하나도 없으면 run을 만들지 않고 거부한다. 보드 상태가 단계의 `requires`와 다르면 **거부**하며 그 단계를 여는 상태를 말한다(``not open: step `implement` opens when the item is `implementing` (now `proposed`)``). `key`가 있으면 그 항목에 배정된 에이전트만 부를 수 있다(``item FEAT-1 belongs to `api-dev`, not `web-dev```). 플랜 밖 에이전트·선택되지 않은 프로젝트도 거부. **`outcome: "handoff"`는 커밋 핸드오프다** — 원장(`AgentRunStep`)에 남기고 같은 단계를 돌려준다(전진·분기·거부 카운트 없음). 재개는 outcome 없는 호출 | 전부 | 4 |
| `pipeline_next` | `{key?, runbook?, project?}` | `key` 있음: 그 항목의 다음 일 하나(`PipelineNext`). 없음: `{head, items}` — `head`는 후보가 없으면 feature-scout, 있으면 pm 디스패치 차례인지(`{action:"dispatch", agent:"pm"|"feature-scout", hint}` 또는 `{action:"none", reason}`), `items`는 열린 항목 각각의 답. 답은 `dispatch` · `wait`(`gate`·`handoff`·`cap`·`acceptance`·`impl-verify`·`qa`) · `accept` · `done` 종류다. 읽기 도구이지만 `doc-audit`·`scout` 완료는 보드 쓰기를 지나지 않으므로 이 호출이 지연 전진을 한다. `runbook`(12자리 소문자 hex)이 있으면 key 없는 개요의 `runbook` 필드는 그 판이 현재 템플릿과 다를 때만 실린다. 없거나 모양이 틀리면 마지막 init이 보고한 판(`Project.runbookVersion`)으로 판정한다. 넘겨받은 판은 저장하지 않는다 | main-loop · harness-watch | 2 |
| `command_next` / `command_ack` / `command_done` | — / `{id}` / `{id, summary}` | 명령 원장 멱등 소비 | routine (Phase 3) | 3 |
| `release_list` / `release_close` | — / `{id, outcome, evidence}` | 배포 확인 원장 | release-verify (Phase 3) | 3 |

**에이전트 서버에 등록되지 않은 것:** 게이트 승인(그래프의 어느 게이트든 — 소유자 서버 `harness_owner`의 `gate_approve`에만 있다), 그래프 편집(웹 전용), 되돌리기, 보류(사람), 폐기, 재개, 재열기(`done→…`), 백로그 편집·삭제, 명령 생성, 토큰 발급. 게이트 승인을 뺀 나머지는 소유자 서버에도 없다 — 웹 전용이다.

## 로컬 세션 감시 — `/harness:watch`

실행 주체는 사용자가 연 Claude Code 메인 대화다. 플러그인 CLI는 시작할 때 `project_get`으로
owner/repo(대소문자 정규화)·설정 slug·available:true를 확인하고, 이후 key 없는
`pipeline_next`만 폴링한다. 총 46자 hs_/hu_만 허용하며 ho_는 거부한다. hu_의 project.slug는
모든 요청에 전달하고, slug 없는 hs_만 legacy 생략을 허용한다. 서버 기본값·dotenv fallback·
redirect 추적은 없다. 서버 도구 집합·인증·사용 기록은 감시 구현에서 바꾸지 않는다. 관리형 감시는
plugin 0.5.13부터 아래 "실행기 lease" 절의 REST 경로로 lease·생존·정지를 보고하며, 그 경로만
`Runner` 행과 `Project.runnerPausedAt`을 쓴다.

checkout CLAUDE.md의 init 관리 runbook start/end marker 사이에서만 12자리 소문자 hex 판을
읽는다. 같은 선언/인자 값의 반복은 허용하고 다른 판·손상된 선언·marker 누락/역순/중복은
네트워크와 상태 쓰기 전에 거부한다. 판 없는 legacy는 runbook을 생략하고 서버 stale 경고를
보존한다. 생성 파일을 해시하거나 private 템플릿·init을 수정하지 않는다.

폴링은 모델을 부르지 않지만 overview 조립·인증과 기존 지연 전진을 실행할 수 있다. 실패/취소
응답도 서버 쓰기 완료 가능성이 있으므로 rollback이나 zero-write를 주장하지 않는다.
work/idle 통지 이후 세션은 저장된 정책과 현재 소유권을 확인하며 work에는 fresh overview를
다시 읽는다. propose:no는 head만 제외하고 항목의 feature-scout 슬롯은 유지한다. 각 새 행동과
재무장 전에 소유권을 확인하고 fresh hint/format/entry 및 AgentRun receipt를 그대로 사용한다.
한 항목의 gate/handoff/cap/acceptance/impl-verify/qa 대기가 다른 ready 항목을 가리지 않는다. 감시가 gate를 자동으로 열거나
push하지 않으며 commit:no의 acceptance/report는 소유자의 실제 commit·명시적 재개를 기다린다.

상태는 realpath로 확인한 공통 Git 디렉터리의 harness/에 있다. mkdir guard로 짧은 동기 파일
구간을 직렬화하고 정책을 먼저·잠금을 commit 지점으로 원자 교체한다. session/poller nonce를
응답 뒤·cleanup 때에도 다시 확인하여 이전 응답이 새 소유자를 덮어쓰지 못한다. 각 session의
poller는 하나이며 ESRCH만 죽음 증거로 쓴다. work/idle은 session을 보존하고 poller만 해제한다.
stop은 root/session만으로 자기 상태를 해제하며 config/token/server 부재에도 실행할 수 있다.
손상 상태·abandoned guard는 force도 우회하지 않는다. 12시간 만료도 owner 확인 후 force가 필요하다.
로컬 잠금은 다른 clone/기기·수동 세션을 잠그거나 이미 실행된 agent/in-flight 요청을 취소하지 않는다.
다른 clone/기기 사이의 중복은 서버의 실행기 lease가 막는다(아래 절). 수동 세션과 옛 플러그인 판의
감시는 lease에 참여하지 않으므로 막지 못한다.

기본 interval=60초, deadline=110분, request timeout=20초, body 한도=1MiB다. fetch/body/sleep/guard
대기는 deadline에 묶이며 최대 1초마다 로컬 소유권을 확인한다. 5연속 전송 실패는 error; 정상
overview가 실패 수를 초기화한다. 같은 비어 있지 않은 작업 집합의 세 번째 work 반환은 stuck이고
빈 관측·작업 identity 변화는 반복 수를 초기화한다. check/HTTP 재시도는 작업 반복 수가 아니다.
이 지표는 AgentRun 내부 진전 watchdog이 아니다.

실제 메인 대화의 완료 통지·재무장, 설치된 skill/CLI/lib 본문과 장시간 latency/비용/권한 창은
[검증 보고서](../test-reports/active/2026-10-02-local-watch-executor.md)에서 자동 시험과 별도로 인수한다.

증거 제출 3종(`plan_submit`·`report_submit`·`validation_record`)은 모두 same-status
`TransitionEvent`(note `plan`·`report`·`validation`, actorId = 호출 토큰)를 남긴다 —
원장 = 감사 로그(불변식 8). `TransitionEvent.channel`은 사람 행에만 `web` | `session`이 실린다(에이전트 행은
null). 클린 사이클의 원장은 정확히 9건이다(제안 · 게이트① · `plan` · `in_review` · `validation` · 게이트② · `report` · `done` · 인수 `report`). `agent_next`의 원장은 따로다 —
`AgentRun`(에이전트·항목별 커서)과 `AgentRunStep`(범위가 확인된 outcome의 수락·거절 감사 기록)이며
`TransitionEvent`에는 남기지 않는다.

## 실행기 lease — `POST /api/runner`

실행기(runner)는 파이프라인 일을 자동으로 이어 가는 로컬 프로세스다. 관리형 `/harness:watch`
(mode `session`)와, plugin 0.5.14부터 창 없는 상주 실행기 `/harness:background`(mode `resident`, Pro 이상)가 쓴다.
서버는 프로젝트마다 lease 하나를 `Runner` 행으로 둔다. MCP 도구가 아니라서 에이전트 모델의 도구 목록에 없다.
결정과 근거는 `docs/proposals/completed/2026-10-21-runner-status-and-background-runner.md`.

- 인증·범위: 다른 REST 경로와 같다(hs_, 또는 hu_ + 본문 `project`; ho_ 거부). 선택되지 않았거나 연결이
  끊긴 프로젝트는 403과 사유다. 프로젝트 300회/10분 구간에 함께 센다.
- 본문: `{op, session, project?}`와 op별 필드. `session`은 로컬 잠금의 UUID다.
  - `start`: `mode`(session|resident), `host`(1–64자), `branch?`·`permission?`(auto|allowlist, resident 필수), `autostart?`, `takeover?`
  - `beat`: `state?`(idle|working|waiting, 없으면 유지), `waitReason?`(dirty|branch, waiting일 때만 그리고 반드시), `lastResult?`(150자), `lastLog?`(경로 구분자 없는 파일 이름, 100자)
  - `stop`: `reason`(owner|stuck|error|plan)
  - `autostart`: `state`(on|off|refused), `host`(1–64자), `branch?`(on·refused 필수), `code?`(refused일 때만 그리고 반드시:
    dirty|autostart-branch|detached|push-url|checkout-in-use|other). `session`은 이 보고를 위해 CLI가 새로 만든 UUID다.
  - 그 밖의 본문(모르는 키 포함)은 400 `Invalid runner request.`
- 응답: 성공은 `{ok:true, paused}`(beat는 `stop:"plan"`을 더할 수 있다). 409 `RUNNER_BUSY`는 `holder:{mode, host, seenAt}`를,
  409 `RUNNER_REPLACED`와 403 `PLAN_REQUIRED`는 코드를 싣는다. 문장은 product-copy §12.
- 잠금과 시계: 모든 op는 한 트랜잭션(READ COMMITTED)에서 User → Project `FOR UPDATE`를 잡은 뒤 접근·플랜·
  `Runner` 행을 읽는다. 시각은 DB 시계(`clock_timestamp()`)다.
- 생존(`packages/core/execution/runner.mjs`, 웹 배너와 같은 함수): stopped가 아니고 마지막 신호 뒤 3분 안이면 lease를 잡고 있다.
  session·working만 신호와 프로젝트의 마지막 에이전트 활동(`AgentRun.openedAt`·`AgentRunStep.at`) 중 늦은 쪽 뒤 60분이다.
  응답 없는 행과 stopped 행은 새 start가 확인 없이 덮어쓰고, 살아 있는 행은 `takeover:true`로만 넘겨받는다.
- 재전송: 같은 session의 start는 성공(seenAt만 갱신)이고 beat는 멱등, 행이 없는 stop은 성공이다. 행이 없거나 다른
  session이거나 stopped인 행에 대한 beat와 다른 session의 stop은 `RUNNER_REPLACED`다.
- 상태가 그대로이고 seenAt이 30초 안이면 beat는 쓰지 않는다.
- 정지: owner는 행을 지운다. 다만 자동 시작이 켜진 resident 행은 `state=stopped`·`stopReason=owner`로 남긴다.
  배너가 "다음 로그온에 다시 시작한다"를 보이고 Pause를 두므로, 소유자가 로그온 전에 일시 정지할 수 있다.
  DB 검사(`Runner_stop_check`, 마이그레이션 `20261022000000_runner_signin_stop`)는 `owner`·`signin`을 `autostart`인
  resident 행에만 허용한다.
  stuck·error·plan은 `state=stopped`로 남아 배너가 이유를 보이고, 다음 start가 덮어쓴다.
- 자동 시작 보고(`autostart`): 로그온 작업이 실행기를 띄우지 못한 이유를 웹에 남긴다. 알림을 놓쳐도 배너에 남는다.
  - on: 행이 없으면 `stopped`·`owner`·`autostart:true` 행을 만든다. 같은 PC의 resident 행이 있으면 `autostart`만 켠다.
    다른 행은 그대로 둔다.
  - refused: 살아 있는 행이 있으면 덮어쓰지 않는다(같은 PC면 `autostart`만 켠다). 없거나 stopped·응답 없는 행이면
    `stopped`·`stopReason=signin`·`lastResult=<code>` 행으로 바꾼다. 배너는 code를 고정 문구로 바꾸고, 모르는 값은 other다.
  - off: 같은 PC의 행만 본다. owner·signin으로 멈춘 행은 지우고, 그 밖의 행은 `autostart`를 끈다.
  - on·refused는 플랜이 `residentRunner`가 아니면 `PLAN_REQUIRED`이고 아무것도 쓰지 않는다. off는 플랜과 무관하다.
- 일시 정지: `Project.runnerPausedAt`. 웹 Action(`requireProjectWrite`)만 바꾸며 멱등이다. 실행기는 응답의
  `paused`를 보고 새 일을 시작하지 않는다. 진행 중인 역할은 끝까지 둔다.
- 플랜: resident start는 `residentRunner`(Pro·Max)가 아니면 `PLAN_REQUIRED`다. resident beat는 거절하지 않고
  `stop:"plan"`을 돌려준다. session은 플랜과 무관하다.
- CLI(plugin 0.5.13): 관리형 start는 로컬 잠금 뒤 lease를 잡고 결과를 잠금의 `runnerLease`(boolean)에 남긴다.
  BUSY면 잠금을 지우고 `busy` 이벤트를 낸다. 404면 `runnerLease:false`로 로컬 잠금만으로 돈다. poll은 beat(idle)
  뒤 `pipeline_next`를 부르고, paused면 `pipeline_next`를 부르지 않으며 반복 수도 바꾸지 않는다. work를 내기 전에
  beat(working)를, stuck·error로 끝날 때 stop을 한 번 보낸다. `harness-session --check`는 `runnerLease`인 Claude
  watch 세션에서만 state 없는 beat를 보내 `paused` 또는 `server:"unreachable"`을 싣고, `--release`는 stop(owner)을
  보낸다. Codex foreground는 이 경로를 부르지 않는다.
- 한계: 옛 플러그인 판과 수동 세션은 lease에 참여하지 않아 보이지도 막히지도 않는다. 서버를 롤백하면(404)
  CLI는 로컬 잠금만으로 계속 돈다.

## 상주 실행기 — `/harness:background` (plugin 0.5.14)

`plugin/bin/harness-background.mjs`(Windows는 `harness.ps1 background`)가 창 없이 도는 상주 프로세스를 띄운다.
루프는 `plugin/runtime/background.mjs`의 `runResident`다. 결정과 근거는 위 제안서 B-1~B-4와 spike 결정 B1~B7이다.

공통 루프는 `execution.start/classify/stopMode`로 실행 시작·결과 판독·종료 전략을 받는다.
현재 실제 연결은 Claude의 `drain`뿐이다. `interrupt` 전략은 Codex 상주 연결을 준비하는
모의 시험에서 검증하며, Codex resident command/skill과 서버 지원은 아직 노출하지 않는다.
실행마다 generation을 증가시키고 해당 handle의 settlement만 소비한다. interrupt 전략은
중지·소유권 상실 뒤 새 overview·dispatch·결과 보고를 막고 자식의 종료 확인을 기다린다.

- 시작: 사용자가 스킬이 보여 준 `!` 명령으로 `--start`를 실행한다. auto 모드 분류기는 세션 뒤에도 남는 프로세스를 띄우는
  명령을 거절하므로 스킬이 직접 실행하지 않는다. 시작 검사는 다음과 같다.
  - 작업 트리가 깨끗한지(`git --no-optional-locks status --porcelain -z`, 추적되지 않은 파일 포함), 브랜치 위인지 본다.
    `pushurl`을 따로 둔 원격이 없는지 보고, 로컬 잠금이 없는지(죽은 resident의 잠금은 지운다) 본다.
  - `project_get`을 확인하고 `claude.exe`가 있는지 본다. `claude -p`를 한 번 띄워 init 메시지의 `permissionMode`를
    읽고 모델 요청 전에 끝낸다.
  - auto면 `permission:auto`다. 아니면 `allowlist`이고, 실행은 `--permission-mode acceptEdits` + 허용 목록이다.
    dontAsk는 파일 쓰기까지 거부하므로 쓰지 않는다(실측).
  - 그다음 정책(commit 고정 true)과 잠금(`mode:"resident"`)을 쓰고 lease start(mode resident, branch, permission,
    autostart)를 보낸다. 404면 시작하지 않는다. 상주 프로세스를 Node `detached`로 띄우고, 그것이 poller로 자리 잡을
    때까지 기다린다.
- 한 사이클(60초): beat(idle 또는 waiting) → paused면 쉼 → `pipeline_next`.
  - 할 일이 있으면 실행 직전 검사를 한다. 미커밋이나 브랜치 변경이면 waiting으로 보내고 알림은 대기 하나에 한 번이다.
    대기가 새로 생기거나 풀리면 다음 사이클을 1초 뒤에 돌아, 배너가 60초를 기다리지 않고 바뀐 상태를 받는다.
  - 검사를 통과하면 `claude -p "/harness:watch --once --session <id>"`를 띄운다. `--settings <common>/harness/background-settings.json`,
    `--disallowedTools "Bash(git push:*)" "PowerShell(git push*)"`, stream-json을 붙인다.
  - 도는 동안 60초마다 beat(working)를 보낸다. 브랜치 감시와 2시간 상한은 2초마다 본다. 브랜치가 바뀌면 실행을 끝내고
    branch 대기로 바꾸고 알림을 띄우며, 이 중단은 실패로 세지 않는다. 브랜치 확인이 한 번 실패하면 로그만 남기고 다음
    확인에 맡긴다.
  - 끝나면 결과 한 줄(`lastResult`)과 로그 이름(`lastLog`)을 beat로 보낸다. 앞뒤 작업 서명이 같거나 비정상 종료·
    시간 초과면 실패이고, 3회 연속이면 멈춘다. 셋 모두 진전 없음이면 stop(stuck), 오류·시간 초과가 섞이면
    stop(error)다. 일시 정지 중에 끝난 실행은 알림 하나를 띄운다.
- 자식 정리: Windows에서 각 `claude -p`는 `runtime/windows/job-launch.ps1`이 만든 kill-on-close job 안에서 돈다
  (breakaway 없음). 상주 프로세스나 런처가 죽으면 도구 셸까지 끝난다. 시간 초과와 브랜치 중단은 런처를 끝내는 것이다.
  다른 OS는 자식을 자기 프로세스 그룹으로 띄우고 그룹에 SIGKILL을 보낸다.
- push 차단: 접두어 거부 규칙에 더해, 자식 환경에만 `GIT_CONFIG_COUNT`/`KEY`/`VALUE`로 빈
  `url.stagekeeper-push-blocked://.pushInsteadOf`를 덧붙인다. 사용자 git 설정 파일은 바꾸지 않는다.
- 멈춤: 로컬 `--stop`은 `lifecycle:"stopping"`을 쓰고, 상주 프로세스는 진행 중인 실행을 끝낸 뒤 stop(owner)을 보내고
  잠금을 지운다. 상주 프로세스와 기록된 child가 모두 이미 없으면 `--stop`이나 다음 start(로그온 시작 포함)가
  죽은 runner의 잠금을 지운다. 실행 중 재부팅이나 강제 종료로 죽은 runner도 같다. 아래 unsettled 잠금만 예외다.
  - 서버의 `stop:"plan"`·`RUNNER_REPLACED`·404와 5연속 요청 실패도 진행 중인 실행을 끝낸 뒤 멈춘다. stuck·error·plan은
    stop을 보내고, replaced·404는 보내지 않는다.
  - 종료 요청·child settlement가 실패하면 `resident-run-unsettled`로 구분하고 자기 lock을
    stopping으로 보존하고 잠금에 `unsettled:true`를 남긴다. 서버 stop과 clearState를 호출하지 않으며 로컬 상태는
    stopping/unsettled다. 다음 start나 반복 stop은 PID가 사라졌다는 이유로 이 잠금과 미정리 child 기록을 지우지 않는다.
- 로컬 파일(공통 Git 디렉터리의 `harness/`):
  - `background.json`: 상태(`--status`가 읽음)
  - `background-settings.json`: 허용 목록
  - `background.log`
  - `runs/<UTC시각>.jsonl`·`.meta.json`(·`.stderr.txt`): 최근 50개
  - `autostart.json`: 로그온 작업 등록 기록
- 자동 시작(Windows): `--autostart-on`은 관리자 권한 없이 로그온 작업을 등록한다. 동작은
  `conhost.exe --headless powershell.exe … harness.ps1 background --start --from-autostart …`이다.
  - 사용자 환경 변수의 hu_ 토큰과 `HARNESS_SERVER`가 있어야 켠다. 등록 때의 브랜치와 다르면 시작을 거부하고 알림을 띄운다.
  - 등록은 그때의 플러그인 경로를 가리키므로, `--status`가 경로 차이를 알린다.
  - `--autostart-on`·`--autostart-off`와 로그온 시작의 거부는 `autostart` op로 서버에 보고한다(plugin 0.5.17).
    거부는 등록 때의 브랜치와 고정 code를 싣는다. 보고는 연결·토큰·서버를 알 수 없거나, 토큰이 다른 저장소를 가리키거나,
    다른 실행기가 lease를 잡았거나(busy), 플랜·경로가 막혔으면 보내지 않는다. 일시적 실패(연결 오류·408·429·5xx)는
    시작 lease처럼 다섯 번까지 다시 보낸다(plugin 0.5.18). 로그온 직후 네트워크가 조금 늦게 붙어도 거부가 배너에 닿게 하려는 것이다.
    끝내 실패해도 명령 결과는 같고 `background.log`에 남는다. 수동 시작의 거부는 보고하지 않는다(소유자가 그 자리에서 이유를 본다).
- 한계: 실행 중에 사람이 같은 작업 트리를 만지는 경우(같은 파일 편집, 커밋·stash·pull, 같은 checkout의 대화
  세션)는 막지 못한다. 안내(`pause before you edit …`)와 인수 검사에 맡긴다.

## MCP 도구 계약 — 소유자 토큰 스코프

서버 이름 `harness_owner`, 엔드포인트 `/api/mcp/owner` — 에이전트 서버(`/api/mcp`)와 **다른 엔드포인트, 다른
검증기**다. Claude Code에서 보이는 이름은 `mcp__harness_owner__<tool>`. 소유자 토큰(`ho_`)은 프로젝트가 아니라
**사용자**에 묶이고(`OwnerToken.userId`) 이 엔드포인트에서만 받는다 — 에이전트 토큰은 여기서 401, 소유자 토큰은
에이전트 서버에서 401. 에이전트 서버의 등록 집합은 그대로다(`src/server/mcp/tools.test.mjs`의 WEB_ONLY 가드).

| 도구 | 입력 | 효과 | 누가 | Phase |
| --- | --- | --- | --- | --- |
| `gate_approve` | `{key, gate, planCommit?, gateEntry?: {runId, entryId}}` | 사람 게이트 전이(actor human, channel session). `→ implementing`은 validation 필수 + `planCommit` 일치. slots-v1은 현재 gateEntry가 필요하다. 정상 응답 `{item, next: PipelineNext}`에는 런북 단계 번호가 없다. 세션은 next를 같은 턴에 수행한다 | 소유자 토큰 | 5 |

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

공통 `board.gate`는 transaction의 저장 결과만 반환한다. MCP adapter가 성공 mutation 뒤에
조언을 조회하며, advice 실패는 `isError:true`/text JSON `{error}`로 이미 승인됐음을 안내한다.
이때 `pipeline_next`를 항목 key로 읽고 `gate_approve`를 재시도하지 않는다. 정확한 reason은
product-copy §12를 따른다. mutation 예외·commit 확인 실패는 원래 예외를 전파하며 저장 완료나
rollback을 단정하지 않는다. 웹은 advice를 조회하지 않고 성공 저장 뒤 경로를 재검증한다.

## 상태 기계

`packages/core/pipeline/transitions.mjs`의 `RULES`가 유일한 출처다. 이 표에 없는 전이는 존재하지 않는다.

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
| `done` | `implementing` | human | reopen | `result` 필수. `acceptedAt`을 지우고 백로그 `removedAt`·`removedReason`을 모두 null로 복원한다(상한은 세지 않는다 — 복원이지 추가가 아니다) |
| `done` | `planning` | human | reopen | `result` 필수. 검증 기록도 지운다. 복원은 위와 같다 |
| `planning` | `in_review` | agent | plan | `plan_submit` 선행 |
| `planning` | `on_hold` | agent | hold | `result` 필수 |
| `implementing` | `done` | pipeline | auto | 현재 실행의 구현 구간 완료 · 결합 보고서 · 고정 result 필수 |
| `implementing` | `on_hold` | agent | hold | `result` 필수 |

부수 규칙: 폐기는 `proposed`·`in_review`에서만(행은 남고 `discardedAt`이 찍힌다) ·
미결(`done`·`on_hold`가 아닌 것)이 2건이면 새로 올리지 않는다 · 최신 행이 `on_hold`인 항목은 다시 올리지
않는다(서버가 거부한다). 소유자가 재개로 잇는다 · `validation` 기록은
`in_review`에서만, 그리고 마지막 `plan_submit` 뒤 plan-verifier의 `verify` ok 원장이 있어야 · `plan_submit`은 `planning`·`in_review`에서만 · `report_submit`은
`in_review`·`implementing`·`done`에서만 · `reason`·`result`·`validation`은 각 150자(선택 `result`도 같다).

식별자·라벨의 대응은 `CONTEXT.md` 「States」. 한국어 상태명(승인대기 등)은 v1/ApcH 시절
이름이며 이 저장소의 DB·MCP·템플릿에는 없다.

## 파이프라인 그래프

선택적 `qa` 노드는 implement와 accept 사이에서 항목 key를 가진 `qa-verifier`를
호출한다(Pro/Max). QA 진입 시 구현 완료 `done`을 기록하며, 현재 entry와 구현 커밋에 묶인
verify/ok·정상 report/ok·구조화된 pass 보고가 모두 있어야 accept로 간다. 실패·차단 보고는
wait-on-QA로 멈추고, 오래된 보고나 닫힌 실패 run은 완료 근거가 아니다. 최종 인수는 메인
루프만 한다. 기존 그래프·기본값은 보존한다. 계약과 배포 순서는
[qa-verifier.md](./qa-verifier.md)를 따른다.

선택적 `impl-verify` 노드는 implement와 accept 사이(`qa`가 있으면 그 앞)에서 항목 key를 가진
`impl-verifier`를 호출한다(Pro/Max). 진입 시 구현 완료 `done`을 기록하며, 현재 entry에서
verify/ok·정상 report/ok로 닫힌 run과 그 run에 묶인 보고가 있어야 다음 노드로 간다. 보고는
열린 결합 run, `docs/agents/impl-verifier/<KEY>.md` 경로, SHA 커밋, 현재 impl-verify entry가
있을 때만 받는다. 실패·차단 보고는 wait-on-impl-verify로 멈추고, 이전 entry의 run은 통과든
실패든 완료 근거가 아니다. 그래프에 이 노드가 있으면 인수는 커서가 accept에 선 뒤에만 받는다.
최종 인수는 메인 루프만 한다. Codex 도우미는 아직 이 디스패치를 거부한다. 계약과 배포 순서는
[impl-verifier.md](./impl-verifier.md)를 따른다.

순서의 단일 출처는 `packages/core/pipeline/pipeline.mjs`, 편집 원본인 `PipelineDefinition`, 펼친 실행 판인 `PipelineVersion`이다. `Pipeline`은 프로젝트 안에서 이름·보관 상태를 갖고 `PipelineRule`은 항목 type별 선택을 정한다. 런북에는 순서가 없다.

실행 판의 `PipelineVersion.pipelineId`와 `pipeline` 관계는 필수다. migration A가 기존 판을 기본 Pipeline에 연결하고, 별도 cleanup migration B가 null 부재를 확인한 뒤 NOT NULL을 강제한다. 새 프로젝트의 `Project.defaultPipelineId`는 지연 생성을 위해 nullable로 유지한다. 운영 적용은 A와 nullable 서버를 먼저 배포한 뒤 B와 필수 schema 서버를 배포하는 두 release 순서를 따른다. B는 기존 writer가 남긴 null을 자동 보정하지 않고 전환을 거부한다. 롤백·재도입은 [제안서의 배포·롤백 절](../proposals/completed/2026-10-16-multiple-pipelines.md)을 따른다.

- **앵커와 슬롯.** plan·implement·accept는 각각 한 번이며 순서가 고정된다. verify는 선택이며 plan과 implement 사이다. 새 정의에는 propose를 저장하지 않는다. doc-auditor·feature-scout는 앵커 사이에 반복 배치할 수 있다. 첫 생성은 접미가 없고 이후 #2, #3 등을 배정한다. 이동·다른 슬롯 삭제로 기존 ID를 바꾸지 않는다. doc-audit·scout는 기존 별칭이며 편집 정규화는 연결 게이트도 함께 옮긴다. 기본 그래프와 scout opt-in은 보존한다.
- **정의와 연결.** 정의는 steps/gates를 저장한다. `pipeline:<id>`는 같은 프로젝트의 활성 정의를 펼치며 `before-pipeline:<id>`는 펼친 첫 단계 앞 게이트가 된다. 순환·중복·앵커 역순은 거부한다. 앵커가 없는 조각은 다른 Pipeline 안에서 쓸 수 있지만 항목의 기본·규칙·선택 대상은 될 수 없다. 저장은 직접·간접 사용처도 재조립하고, 항목을 받던 사용처가 깨지면 전체를 취소한다. 실행 그래프가 같으면 기존 실행 판을 재사용한다.
- **자동 선택.** `Project.autoProposeEnabled`는 PM 자동 선택 설정이며 기본값은 true다. Pro·Max 소유자만 Pipeline 탭에서 변경한다. 꺼도 열린 PM 실행은 닫지 않는다. 규칙이 없는 type과 null type은 기본 Pipeline을 사용한다. 웹 Put on the board는 활성 실행 가능 Pipeline을 직접 고를 수 있다. 다운그레이드 후에도 저장된 기본·규칙과 항목 선택은 유지된다.
- **자동 발굴.** `Project.autoScoutEnabled`는 빈 후보 백로그를 채우는 head scout의 소유자 설정이며 기본값은 true다. Pipeline 탭 시작 부분에 조건부 Scout를 표시하고 Free·Pro·Max 모두 켜거나 끌 수 있다. 항목 그래프의 편집 권한·버전과 독립적이며 변경은 즉시 적용한다. 후보가 없고 꺼져 있으면 head는 `Automatic scouting is off. Add a backlog item, or turn it on in the Pipeline tab.`을 반환한다. 후보가 있으면 pm의 기존 규칙을 따른다.
- **자동 발굴 중단.** 웹 action은 세션 소유자와 프로젝트 쓰기 접근을 검사하고 `User → Project` 잠금 안에서 설정 저장과 열린 독립 Scout run 종료를 함께 수행한다. 꺼진 동안 독립 Scout `agent_next`는 단계·새 run을 주지 않고, 종료된 run의 `backlog_add`는 거부한다. 이미 전달된 로컬 지시 자체를 취소하지는 않는다. entry에 묶인 Scout 슬롯과 다른 에이전트는 유지한다. 레거시(format=null) 항목의 Scout는 독립 run과 구별되지 않으므로 실제 커서가 Scout에 있을 때 그 공유 run을 보존하고 호출을 허용한다. 레거시 슬롯이 없을 때는 일반 중단 규칙을 적용한다.
- **자동 발굴 배포.** 먼저 `20261001000000_automatic_scout_control` migration을 적용한 뒤 새 서버를 배포한다. 기존 프로젝트는 true로 유지되고 이전 서버는 추가 컬럼을 무시한다. 새 서버는 컬럼을 읽으므로 migration 없이 실행할 수 없다. 되돌릴 때는 이전 서버로 돌아가고 컬럼을 남긴다. 운영 DB 변경은 별도 배포 작업으로 수행하며 개발·인수 시험은 격리 DB만 사용한다.
- **게이트.** before-<slotId>는 해당 슬롯 앞 간선이다. before-propose는 없다. before-plan과 before-implement만 승인이 상태 전이를 함께 수행한다. 나머지는 same-status 감사 이벤트다. 새 형식의 승인은 읽어 둔 gateEntry(runId, entryId)를 그대로 제출해야 하며 잠긴 현재 회차에서 한 번만 소비된다. 과거 이벤트나 같은 timestamp는 재승인 근거가 아니다.
- **버전과 회차.** 새 PipelineVersion.format은 slots-v1, 기존 행은 null이다. 실행 판 번호는 프로젝트 전체의 증가 일련번호이고 정의 번호는 Pipeline별로 증가한다. 항목은 시작한 실행 판에 고정된다. 예외는 Proposed·slots-v1·열린 런이며 그 런에 묶인 AgentRun이 하나도 없는 경우다. 소유자의 웹 Change pipeline이 User → Project 잠금과 expectedUpdatedAt CAS 아래 다른 Pipeline의 현재 실행 판으로 다시 고정하고, 새 entryId로 머리에서 시작한다. 같은 상태 이벤트 `pipeline-changed:<옛 판 id>:<새 판 id>`를 human/web으로 남기고 필요하면 별도 자동 전이를 기록한다. 이후 pipeline_next의 version·entry도 새 판을 가리킨다. 이 변경은 두 MCP 서버에 없다. PipelineRun.entryId는 진입·reset마다 새로 생성한다. 기존 행의 nodes/gates를 backfill하지 않는다. 알 수 없는 형식은 거부한다. GET과 head 조회는 Pipeline·정의·실행 판을 생성하지 않는다. 첫 쓰기는 가상 기본을 지연 생성하며, 모든 쓰기는 User → Project 순서로 잠근 뒤 접근·플랜을 재검사한다.
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
`done`은 pipeline이 구현 구간 완료 증거를 확인한 상태이며 인수는 아니다.

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

보류 항목은 pm이 다시 올리지 않는다(`board_propose`가 거부한다). 소유자가 재개로 잇거나 백로그에서 제거한다.
계획부터 다시 쓸 것이면 `planning`으로, 기존 계획으로 이어갈 것이면 `implementing`으로 되돌린다.
화면의 주 버튼은 멈춘 자리(보류 이벤트의 `from`)로 돌아가는 쪽이다.

### 백로그 작성 규칙

사람은 Title만 필수다. Area·Source·Type은 선택이고 Source는 자유롭게 쓴다.
scout는 Title·Area·Source·Type을 모두 채운다. Area는 roster 안의 workspace 경로이며,
새 기능이라 아직 파일이 없어도 workspace는 있어야 한다. 담당이 없으면 보고서에만 남긴다.
pm은 빈 area에서 워크스페이스가 하나면 그 dev, 여럿이면 title/source로 배정하며
reason에 `area unset — guessed`를 적는다. 저장된 area는 고치지 않는다.

scout source의 첫 줄은 `Evidence: competitor` / `Evidence: users ask` / `Evidence: our hole`.
competitor는 URL과 왜 이 사용자에게 필요한지, users ask는 요청자·출처,
our hole은 관측과 코드 확정을 구분한 `file:line`을 적는다. `Effect:`와 `Cost:`를 덧붙인다.
자기 문장으로 확인한 사실을 쓰고 외부 문장은 복사하지 않는다. 서버는 이 문장 형식을 검사하지 않는다.

- Key는 모든 추가 경로에서 기존·제거된 ITEM 숫자 suffix의 최대값+1을 발급한다.
  최소 두 자리이며 99 다음은 ITEM-100. 기존 FEAT 등의 key는 바꾸지 않는다.
- `type`은 feat/fix/refactor/docs 또는 null. `addedBy`는 owner/feature-scout.
  공개 backlog 응답(중첩 응답 포함)은 type·addedBy·removedReason을 보이고 내부
  `typeSetBy`·`addedByRunId`는 내보내지 않는다.
- 사람의 type 변경은 읽어 둔 `typeBefore`에 대한 CAS이고, 제목만 고친 저장은 type 작성자를 바꾸지 않는다.
  비우면 type/typeSetBy 모두 null. `plan_submit`의 선택 type은 빈 값·에이전트 값을 채우거나
  바꾸되 owner 값은 보존한다. 다를 때만 응답에 `typeKept: "owner"`가 실린다.
  제출할 type의 근거는 커밋 전 계획서에 쓰며 응답을 받고 계획서를 다시 고치지 않는다.
- `backlog_add`는 `User → Project` 잠금 안에서 run 소속·열림, 누적 3건(제거분 포함),
  플랜 상한을 검사하고 key를 발급한다. 닫힌·타 프로젝트·다른 agent run은
  `backlog_add needs an open feature-scout run`, 누적 초과는 `this run already added 3 items`.
  토큰은 agent 정체를 인증하지 않으며 열린 scout run이 권한 근거다.
- 보드에 올리는 것만으로 제거하지 않는다. 완료는 `removedReason: done`, 사람 제거는 owner,
  Proposed 폐기는 discarded. In review 폐기는 백로그를 유지한다. 제거 시 removedAt도 함께 찍으며
  살아 있는 행의 removedReason은 null이다. 재열기는 두 열을 모두 null로 한다.
- 후보는 제거되지 않았고 최신 행이 미결도 보류도 아닌 백로그 항목이다.
  head는 미결 2건을 먼저 검사한다. 후보가 없을 때 Scout 노드가 이미 dispatch 중이면 head는 쉰다.
  그 다음 자동 발굴 설정을 검사하며 꺼져 있으면 사람이 백로그를 추가하도록 안내한다.
  마지막 추가·제거 시각 뒤 report/ok 수락 원장과 함께 닫힌 scout run이 있으면 다시 부르지 않는다.
  그래프에 묶인 scout 완료도 이 판정에 포함하며, 도중 닫힌 run은 포함하지 않는다.
  후보가 있으면 PM 자동 선택 설정과 dispatch 상한을 본다. head scout는 PM 자동 선택 설정과 상관없이 돈다.
  dispatch 상한에서도 선택된 agent의 열린 단독 run은 재개할 수 있다. 그래프 슬롯 run은 head가 이어받지 않는다.
  head scout는 entry 없이 receipt만 사용하고, 그래프 Scout는 기존 slot 결합 규칙을 따른다.

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

## 토큰 인증 사용 기록

`ProjectToken`, `OwnerToken`, `UserToken`의 nullable `lastUsedAt`은 작업 완료가 아니라 등록된 미폐기 credential을 받아들인 시각이다. MCP `/api/mcp`(hs_/hu_), `/api/mcp/owner`(ho_)와 REST `/api/templates`, `/api/project`, `/api/runbook`(hs_/hu_), `/api/projects`(hu_)의 인증 직후 내부 ID로 기록한다. downstream body·project·plan·tool 거부는 이미 받아들인 credential의 기록을 취소하지 않는다. 유효 hu_의 PROJECT_REQUIRED 401도 기록한다.

기록은 id·미폐기·(기존 시각 없음 또는 요청 시각보다 60초 이상 이전)의 원자적 updateMany다. 최초 기록은 즉시 저장하고 역순 요청·폐기 후 기록은 행을 바꾸지 않는다. 매 인증은 query를 await하므로 60초 조건은 행 변경만 줄이고 추가 DB 왕복·대기는 남는다. 부가 기록/진단 오류는 원래 인증 결과를 바꾸지 않으며 고정 메시지와 kind만 진단한다. 최초 인증 조회 실패는 기존대로 전파한다. 웹 목록·발급·복사·폐기는 사용 기록이 아니다.

신규 writer는 발급 시 `usageTrackingStartedAt`만 설정한다. 기존 행은 backfill 없이 두 열 null이며 Unknown이다. 시작값만 있으면 Never used(추적 후 기록 없음), lastUsedAt이 있으면 UTC 분으로 표시한다. 기록은 완전한 감사나 실제 미사용 보증이 아니다. DB 확장 → 새 generated client/앱 → 구버전 worker drain 순서로 배포한다. 롤백은 nullable 열과 기록을 보존한다. 새 서버 렌더에서 목록을 갱신하며 polling·탭 간 자동 최신화는 없다.

## Dual-client 소스 계약

2026-10-03 구현된 계약이다. 실제 Codex 모델 권한·설치·교차 클라이언트 인수 및 배포는
[runtime 보고서](../test-reports/active/dual-client-runtime-report.md)의 required 미완료 항목이다.

`GET /api/templates`, `pipeline_next`, `agent_next`의 선택적 `client`는 `claude|codex`이며
생략은 Claude다. Codex 성공 응답은 REST body 또는 MCP `ServerResult.item`의 text JSON 내부에
`runtime:{client:"codex",protocol:"harness-runtime-v1"}`을 포함한다. Claude의 기존 shape에는 추가하지 않는다.
client는 원장·승인·사용량 identity나 token scope에 저장하지 않는다. 다른 유효 caller도 같은
열린 run의 receipt와 slots-v1 entry를 재사용하며 기존 CAS·호출자 사용량 계약을 따른다.

REST는 요청 언어의 완전한 entitled bundle만 전달하고 언어 fallback을 하지 않는다.
MCP는 프로젝트 언어에 `CODEX.runbook.md` 행이 없을 때만 전체 영어 bundle로 fallback한다.
행이 있으나 불완전하면 거부한다. bundle은 Codex 런북·dev·플랜의 보고 역할과 공통 문서 네 개이며,
각 역할 stub과 런북에 정확히 한 개의 protocol marker가 있어야 한다. 단계는 기존 parser로 검증한다.
`agent_next`는 모든 단계 body를 먼저 render한 뒤 cursor/outcome transaction을 시작한다.
`pipeline_next`는 Codex bundle과 source hash를 확인한 뒤 lazy advance를 수행한다.

Codex `pipeline_next`는 매 호출에 현재 raw source의 `codexRunbookVersion`을 보낸다.
CRLF를 LF로 정규화한 치환 전 런북의 hash이며 생성 body의 hash가 아니다.
Claude의 기존 `runbookVersion` 함수와 init/seed의 정규화·stale 판정은 유지한다.
Codex stale/missing hash는 실행 거부이고 Claude advisory 계약은 변경하지 않는다.

Codex의 keyed `wait/on:handoff`와 overview item에는 현재 열린 실행에서 얻은 선택적
`resume:{agent,key,format,entry?,agentRunId}`를 추가한다. legacy null과 slots-v1을 구분하며,
이 projection은 실행을 새로 열거나 handoff를 지우지 않는다. helper는 명시적 계속 요청의
`--handoff-commit`과 현재 role/key의 준비 파일·commit을 확인한 후 같은 run에 outcome 없는 재개를 한다.
helper는 full SHA·파일 경로·LF 정규화 내용 hash·agent/key·기존 run/entry를 `commitHandoff`로
새 역할에 전달한다. 역할 시작과 plan/report 제출 직전에 commit·파일·실행 결합을 다시 확인한다.
인계 note는 저장소 안의 해당 산출물 상대/절대 경로를 받을 수 있다. 제출용 상대 `path`와
파일 도구용 `absolutePath`를 구분하며 저장소 밖 경로나 다른 역할/항목의 파일은 거부한다.
역할의 commit 생성 권한은 계속 false다. 소유자가 이미 커밋한 동일 산출물의 제출은 허용하며,
내용이 바뀌면 이전 커밋으로 제출하지 못한다. board의 planCommit과 인계 커밋은 별도 증거다.
승인 이후에는 저장된 next 조언 대신 현재 client/hash의 최신 pipeline 응답과 board 증거를 다시 읽는다.

로컬 실행은 canonical common Git의 `harness/watch.json`, `watch.lock.json`, `watch.guard`를 공유한다.
기존 binding 다섯 key는 그대로이고 새 metadata는 top-level `client`, `mode`, `lifecycle`, `children`이다.
누락 metadata는 Claude/watch/active다. foreground start는 활성 state를 덮어쓰지 않는다.
`mode`는 watch·foreground·resident(plugin 0.5.14, 상주 실행기)다. 옛 판은 resident를 손상 상태로 보고 거부한다 —
같은 저장소에서 섞여 돌지 않게 하려는 의도다. resident는 자기를 poller로, job 런처를 children으로 등록한다.
공통 session CLI의 stop은 token/config 없이 stopping을 기록하고 release는 stopping·poller null·children empty를 요구한다.
Codex adapter는 terminal turn 확인과 실제 child/bridge 종료 뒤 child를 정리한다. process death만으로
미확인 turn을 정리하지 않는다. Claude host는 자신의 native role/tool 완료를 직접 확인해야 한다.
업데이트된 watch는 `--start --managed`를 사용한다. metadata 없는 legacy stop의 즉시 정리 계약은 유지하되
새 skill/adapter는 그 경로로 managed 잠금을 반납하지 않는다. guard·successor의 ID/nonce를 확인하며 자동 회수하지 않는다.

Codex role dispatcher는 모델 없는 effective config와 플랫폼별 실행 preflight 후 새 App Server thread를 시작한다.
공통 MCP parser는 기본적으로 객체 응답을 요구한다. 로컬 client의 `backlog_list`와
`board_list` 호출만 객체 배열 계약을 선택하며, 빈 배열도 유효하다. 오류 본문은 여전히
객체여야 하고 JSON-RPC ID·content 검사와 pipeline/agent 응답의 객체 계약은 유지한다.
CLI 탐색은 PATH의 지원되지 않는 Windows wrapper를 실행하지 않고 다음 후보를 검사한다.
npm wrapper는 package identity·entry와 실제 `--version` 응답을 확인한다. helper는 선택한 경로·
버전과 건너뛴 후보를 `cli-selected`로 출력하고, 그 실행 파일로 기존 App Server preflight를 수행한다.
다른 inherited MCP·plugin을 끄고 shell 환경을 `inherit="none"`으로 설정한다. 상속된 명시적 환경 값도 비우되
`PATH`와 대소문자 별칭에는 고정 시스템 도구 경로만 지정한다. POSIX는 `/usr/local/bin:/usr/bin:/bin`,
Windows는 시스템 디렉터리와 Windows PowerShell 경로다. 사용자 도구 경로·credential 값은 전달하지 않는다.
named filesystem/network policy와 도구 목록을 확인한다.
허용된 역할 MCP 도구만 개별 `approval_mode="approve"`로 설정하고 기본값은 `prompt`로 유지한다.
owner 도구·권한 상승 요청은 거부한다. legacy sandbox 설정이 named policy와 함께 남아 있으면 실행하지 않는다.
파일 도구가 없는 PM을 제외하고, POSIX는 동일 named policy의 `command/exec`로 고정 marker를 먼저 확인한다.
POSIX preflight는 `cat` 명령의 경로 해석도 확인해 읽기 도구가 없는 셸에서 모델을 시작하지 않는다.
실행 불가 시 모델을 호출하지 않고 `codex-role-execution-unavailable`로 실패한다.
이를 재초기화·WSL 설치·다른 클라이언트 로그인으로 복구하도록 안내하지 않는다.
Stagekeeper 런타임 호환성 결함으로 보고하고 미확인 소유권과 역할 권한을 유지한다.
marker 성공만으로 파일 읽기/쓰기 격리 인수 통과를 선언하지 않는다.

Windows에서는 `plugin/runtime/role-files.mjs`가 역할별 localhost MCP bridge에
`role_file_read/list/search/write`를 추가한다. 서버 domain 도구 목록·managed 역할 TOML은
그대로이며 파일 도구를 서비스에 전달하지 않는다. PM에는 파일 도구를 주지 않는다.
로컬 도구의 bridge schema는 선택적 `project`를 받는다. 현재 dispatch의 project와 같은지
확인한 뒤 backend 호출에서 제거하며, 다른 값과 나머지 미허용 인자는 거부한다.
`rolePermissions`의 동일한 절대 경로 정책을 사용하고 가장 구체적인 규칙을 적용한다.
root deny, 외부/인증 경로 차단, 다른 workspace deny, Git·관리 파일 read-only를 유지한다.
관리 경로가 아직 없어도 쓰기를 거부하며 device/UNC/ADS·junction/symlink/hardlink 별칭을
거부한다. 파일 쓰기는 현재 SHA-256 또는 신규 파일의 null을 요구하며 변경 시 거부한다.
허용된 파일의 최초 읽기 또는 디렉터리 조회·검색에서 대상이 없으면 bridge는
`-32004`로 경로 부재를 알린다.
이 응답은 쓰기 권한을 부여하지 않는다. 현재 단계가 신규 파일 생성을 요구할 때만
`expectedHash:null`로 생성하며, 금지된 경로는 존재 여부와 관계없이 일반 거부로 남긴다.
읽기·검색·요청 크기는 제한되고 불완전한 검색은 명시하며 검증 성공으로 취급하지 않는다.

Windows preflight는 이 파일 backend의 실제 scratch 생성·읽기·hash 일치와 drive root
접근 거부를 모델 전에 확인한다. 파일 호출에도 `agent_next` receipt, active Codex 소유권,
완료·중지 fence를 적용한다. 겹친 정상 도구 요청은 역할별 제한된 큐에서 순차 실행한다.
최대 HTTP 요청/큐 길이는 각각 32, 역할의 총 도구 호출 예산은 100이다. 실행 직전에 최신
receipt와 active 소유권을 확인하고, 중지하면 대기 요청을 실행하지 않는다. bridge 종료는
진행 중 요청의 종료를 기다린다. broker는 고정 데이터 연산만 수행하며 모델 코드나
임의 명령을 실행하지 않는다. shell/unified exec는 Windows에서 비활성화한다.
`view_image`와 `request_permissions_tool`도 모든 역할에서 비활성화하며 effective config로
확인한다. 기존 named filesystem/network policy와 승인 거부는 유지한다.

Windows install bundle에 검증된 runtime이 있으면 `role-commands.mjs`가 모델 전에 실제
Node pipe 자식 실행·파일 허용/거부·AAP 전용 파일 거부·root listing 거부·부모와 자식의
loopback network 거부를 시험한다. 성공한 non-PM 역할에만 `role_command_exec`을 추가한다.
source-only checkout은 파일 backend를 유지하며, 잘못된 bundle은 명령 preflight에서 실패한다.
CLI의 shell/unified exec는 계속 비활성화한다.

명령은 같은 파일 정책으로 내보낸 repository와 role scratch의 새 복사본에서 실행한다.
Git·`.codex`·`.claude`·`.next`·`.env`(예제 제외)와 denied 경로를 제외하고 binary도 hash를
기록한다. alias/hardlink·복사 중 변경은 거부한다. 한 파일 128MiB, 100,000개·총 2GiB,
각 snapshot 준비 300초를 상한으로 둔다. 최대 8개 파일을 별도 buffer로 복사하며 모든
진행 중 복사를 join한 뒤 오류를 전파·정리한다. 실제 경로와 IO 전후 identity·mtime·size를
매번 확인하며 권한·경로 결과를 cache하지 않는다.
역할 SID 권한은 복사 전에 부여한다(helper `prepare`). 상속 권한은 빈 repository·scratch·runtime
루트에, root의 상속되지 않는 Traverse 권한은 복사 전 root에 둔다. 복사된 파일은 생성 시 상속하며
채워진 트리에는 ACL을 쓰지 않는다.
`cwd`는 repository 상대 경로이고 `STAGEKEEPER_ROLE_SCRATCH`는 복사한 scratch다.
전체 source/scratch hash·누락 수/경로·누락 목록 잘림을 결과에 포함한다. 결과의 단계별 소요
시간(`timings`, helper ACL 단계 `aclMs`)은 숫자 ms만 담는다. 모든 복사본 쓰기와
산출물은 버리며 원본으로 동기화하지 않는다. 원본 수정은 guarded 파일 도구를 사용한다.
누락된 Git·환경·network 의존성을 별도 인수로 남기고 exit 0을 전체 검증으로 해석하지 않는다.

Windows에서 PM과 `qa-verifier`를 제외한 역할의 Git 조회는 별도 `role_git_read` 고정 데이터 도구를 사용한다.
QA는 모든 플랫폼에서 파일·브라우저 도구만 사용하며 Git·명령 실행 도구를 받지 않는다.
`head`, `show`, `diff`, `status`만 제공하며 일반 명령 backend에 Git이나 원본 `.git`을
추가하지 않는다. 파일 선택은 절대 경로의 구체적인 허용 파일 최대 50개이며 같은 파일
정책·receipt·active 소유권·중지 fence를 적용한다. `show`는 한 파일만, `show/diff`의 ref는
HEAD 또는 해당 dispatch에 기록된 planCommit을 허용한다. 인계 재개에서는 검증된
commitHandoff.commit도 허용하되 그 인계 파일 하나에만 적용한다. 외부·다른 workspace·인증·환경
파일·directory·glob은 거부하고 전체 저장소 검증으로 해석하지 않는다.
현재 경로가 삭제되었거나 일반 파일로 바뀌어도 비교 commit에서 directory/tree·symlink·
submodule이면 거부한다. literal pathspec의 역사 tree 재귀로 금지된 하위 파일을
노출하지 않도록 HEAD와 조회 ref의 파일 type과 선택 범위를 먼저 확인한다.

기존 native Git의 고정 builtin 조회만 shell 없이 실행한다. 세션의 공통 Git 디렉터리와
worktree HEAD를 확인하고 객체·필요한 index를 새 owned 비공개 데이터베이스에 복사한다.
공통 디렉터리의 양쪽 경로에서 ancestor alias/link를 먼저 거부한 뒤 OS의 native realpath를
비교한다. Windows TEMP의 8.3 축약 이름과 Git이 기록한 긴 이름은 같은 실제 디렉터리이면
일치한다. 다른 저장소나 junction/symlink를 세션 binding으로 허용하지 않는다.
원본 config·hooks·credentials·replace refs·alternates·promisor 데이터는 사용하지 않는다.
소유자 환경을 전달하지 않으며 system/global config·pager·fsmonitor·외부 diff·textconv·
lazy fetch·submodule 조회를 비활성화한다. system/global config와 attributes 파일은 `NUL`
대신 조회 디렉터리의 빈 owned 파일을 가리킨다. 객체 alias/hardlink·복사 중 변경을 거부하고
파일 128MiB·100,000개·총 2GiB·준비 300초, 조회 10초·출력 1MiB를 상한으로 둔다.
표준 Git for Windows의 cmd/bin launcher 대신 같은 설치의 실제 builtin(2.56부터 `ucrt64`,
이전 판 `mingw64`)을 호출한다. launcher의 종료만 reader 종료로 계산하지 않으며 확인되지 않는 shim은 거부한다.
프로세스를 같은 소유권에 등록하고 중지 시 실제 종료와 reader EOF를 기다려 settle한다.

`diff`는 HEAD/planCommit에서 만든 private index와 현재 허용 파일의 byte 내용을 비교한다.
추적되지 않은 신규 파일은 `status`로 확인한다. `status`는 복사한 private index와 선택한
현재 파일을 사용하고 선택 파일의 assume-unchanged·skip-worktree flag를 복사본에서만
지운다. 이 flag로 실제 수정이 숨겨지면 검증 증거가 될 수 없다. 원본 index가 없으면
HEAD에서 복사본 index만 구성한다. ignore rules·rename 추적·filter·line-ending 변환을
재현하지 않는다. 응답에 commit·파일 hash·선택 파일 범위를 명시하고 원본 파일과 HEAD가
조회 중 변경되면 거부한다. Git 조회 산출물·index 변경은 버리며 원본 metadata 쓰기나
commit은 허용하지 않는다. 누락·거부·출력 상한은 blocked이며 성공 판정으로 사용하지 않는다.

trusted PowerShell/C# helper는 새 LPAC profile에 `registryRead`만 주며 AAP opt-out과
AppContainer SID·capability를 suspended process에서 확인한다. ACL은 새 owned root의
metadata와 복사본에만 부여한다. 원본 repository·인증·drive root의 ACL은 바꾸지 않는다.
실행 helper는 새 profile을 만든 뒤 그 SID가 준비한 SID와 같은지, root와 세 루트에 준비한 규칙이
있는지 읽기만으로 확인하고 다르면 실행하지 않는다.
Node의 일반 realpath/module semantics를 유지하기 위해 쓰지 않는 drive letter를 같은
logon session에 임시 매핑한다. process 전용 매핑으로 주장하지 않으며 정상 종료 확인 뒤
정확한 target을 지정해 해제한다. 자식은 같은 LPAC와 kill-on-close Job Object를 상속한다.
stdin EOF, 고정된 환경과 runtime/System32 PATH만 전달하며 network capability는 없다.
helper는 사용하는 Windows PowerShell 코어 모듈(Management·Utility)을 `$PSHOME`에서 절대
경로로 먼저 로드하며 host 모듈 경로의 자동 로드 탐색에 의존하지 않는다.

helper는 `prepare` 실행을 포함해 소유권 등록·active 확인 뒤에만 컴파일/실행하며 command 중에도 active를 확인한다.
신뢰된 compiler 임시 파일은 검증한 owned 하위 디렉터리에서 만들고, untrusted 실행 전에
같은 compiling process가 삭제한다. 실제 시작 marker와 종료 acknowledgement를 구분하며
컴파일 중 도착한 stop도 suspended 자식의 resume 전에 확인한다.
stop·소유권 상실·timeout·출력 상한·root 종료 시 job 전체를 종료한다. active process 0,
root terminal, output reader EOF, drive/profile cleanup을 확인한 nonce acknowledgement 뒤에만
tracked helper를 settle한다. 오류·ack 누락은 ownership과 owned 복사본을 보존한다. 명령이
끝난 트리에 ACL 변경을 전파하지 않으며 확인된 owned root만 삭제한다. 비정상 helper 종료의
남은 profile/drive는 명시적 복구 대상이며 자동 잠금 회수 근거가 아니다.

종료 확인을 마친 owned 복사본을 삭제할 때는 Windows의 일시적인 실행 파일 잠금에 대해
Node의 100ms 선형 backoff로 최대 10회 재시도한다. 재시도 후에도 삭제가 실패하면 오류를
전파하며, 종료 미확인 상태의 소유권·복사본 보존 조건은 유지한다.

운영자는 고정 Node source와 libuv pipe backport로 만든 runtime·원본 npm·license를
`package-windows-plugin.mjs`로 완전한 원본 verifier와 함께 전달한다. verifier는 양쪽 client의
skill 경로에 같은 checksum으로 복사한다. Windows helper는 `bin/harness.ps1`에서 bundled
Node를 검증해 실행하며 별도 Node/검증 스킬 설치를 요구하지 않는다. generated binary와
private verifier 본문은 public Git에 넣지 않는다. private 로컬 패키지 생성·시험과 실제
패키지 공개/설치는 별도 상태이며 완전한 Windows 인수와 출시 승인 전 readiness를 선언하지 않는다.

내용이 바뀐 install bundle은 Claude/Codex manifest의 버전을 함께 올린다. Claude Code의
같은 버전 update는 이전 캐시를 유지할 수 있으므로 새 파일을 같은 버전으로 배포하지 않는다.
업데이트 인수는 종료 코드만 확인하지 않고 실제 client의 설치/loader 경로에서 전체
inventory·runtime·완전한 verifier checksum을 새 배포물과 대조한다. 설치 변경 후 client를
재시작해 적용하며 이전 소유권/실행을 자동으로 회수하거나 이전 generated 파일을 채택하지 않는다.

parent HARNESS token 대신 일회성 localhost bridge capability만 child에 준다. verifier의 완전한 owner package를
scratch의 `.agents/skills/reconciling-proposals-with-codebase`로 복사하고, 원본·복사본의 checksum과 파일 수를
init metadata와 비교한다. 이 패키지만 scratch 쓰기 권한보다 좁은 읽기 전용 권한으로 지정한다.
owner `.codex` 인증 디렉터리는 계속 차단한다. 실제 skill 목록에서 복사본의 정확한 경로 하나를 확인해
그 skill만 활성화하며 같은 이름의 원본을 포함한 다른 skill은 비활성화한다. 부모 대화·판정 목록을 전달하지 않는다.
PM은 파일 도구가 없고 scout만 web search를 허용한다. Git metadata는 read-only이며 child commit은
main loop/owner로 handoff한다. 실제 모델의 tool/kernel 격리 증거는 별도로 필요하다.

## Failed acceptance and owner retry

`pipeline_next` at accept returns `{action:"wait", on:"acceptance", key, node:"accept", version, checks, note}` while an uncleared AcceptanceFailure exists. `board_get` includes the latest active failure even outside the History window. A main-loop report in done is refused while failed; other reporters retain their existing rules.

Only the owner web action runs acceptance again. Under User → Project → current run locks, owner authorization and expectedUpdatedAt CAS, it advances updatedAt, writes same-state `acceptance-retry` with human/web, and sets clearedAt to that event time. It neither advances the cursor nor changes acceptance/backlog. Reopen clears active failures in the same transaction and restores backlog as before. Both retain the audit rows. Retry is absent from both MCP registries.

Rollout requires compatible watch first, then the additive migration before server/web, then a verified full template bundle. Production migration, template seeding and marketplace changes require their own authorization.
