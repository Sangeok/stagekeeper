# 프로토콜 — 도구 계약과 보드 규약

에이전트가 서비스에 말을 거는 방법(MCP 도구)과 보드 항목이 지켜야 하는 기록 규약을
한곳에 둔다. 왜 이래야 하는지는 [invariants.md](./invariants.md), 어디서 왔는지는
[sources.md](./sources.md)에 있다.

## MCP 도구 계약 — 에이전트 토큰 스코프

서버 이름 `harness`. Claude Code에서 보이는 이름은 `mcp__harness__<tool>`. 도구명은 밑줄(점 금지 — 클라이언트 정규화 회피).

| 도구 | 입력 | 효과 | 누가 | Phase |
| --- | --- | --- | --- | --- |
| `project_get` | — | 프로젝트·roster·워크스페이스 | 전부 | 1 |
| `project_sync` | `{workspaces[]}` (= `harness.json.workspaces`) | 워크스페이스 upsert(roster 갱신) | init 스킬 | 1 |
| `backlog_list` | `{includeRemoved?}` | 백로그 항목 + 최신 보드 status | pm·dev·doc-auditor | 1 |
| `backlog_get` | `{key}` | 항목 1건(`source` 전문) | dev | 1 |
| `board_list` | `{open?}` | 항목별 **최신** 보드 행 | pm·dev·main-loop·plan-verifier | 1 |
| `board_get` | `{key}` | 최신 보드 행 + 전이 이벤트 + 보고 | dev·plan-verifier·main-loop | 1 |
| `board_propose` | `{key, agent, reason}` | `proposed` 행 생성. **거부**: 미결 ≥ 2, agent가 roster 밖, reason > 150자, 이미 미결인 key | pm | 1 |
| `board_transition` | `{key, to, result?}` | 에이전트 허용 전이만(§ `transitions.mjs`). `result` ≤ 150, 누적. `in_review`는 `plan_submit` 선행 필수. `done`은 백로그 항목 자동 제거 | dev | 1 |
| `plan_submit` | `{key, path, commit}` | 계획서 위치 기록 | dev | 1 |
| `report_submit` | `{key, actor, path, commit}` | 행위자 기록 위치 | dev·main-loop | 1 |
| `validation_record` | `{key, text}` | `validation` — **`in_review`일 때만**. 되돌리기 시 서버가 지움 | main-loop | 1 |
| `command_next` / `command_ack` / `command_done` | — / `{id}` / `{id, summary}` | 명령 원장 멱등 소비 | routine (Phase 3) | 3 |
| `release_list` / `release_close` | — / `{id, outcome, evidence}` | 배포 확인 원장 | release-verify (Phase 3) | 3 |

**등록되지 않은 것(웹 전용):** 게이트 승인(`proposed→planning`, `in_review→implementing`), 되돌리기, 보류(사람), 폐기, 재개, 백로그 편집·삭제, 명령 생성, 토큰 발급.

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
| `planning` | `in_review` | agent | plan | `plan_submit` 선행 |
| `planning` | `on_hold` | agent | hold | `result` 필수 |
| `implementing` | `done` | agent | done | `report_submit` 선행 · `result` 필수 |
| `implementing` | `on_hold` | agent | hold | `result` 필수 |

부수 규칙: 폐기는 `proposed`·`in_review`에서만(행은 남고 `discardedAt`이 찍힌다) ·
미결(`done`·`on_hold`가 아닌 것)이 2건이면 새로 올리지 않는다 · `validation` 기록은
`in_review`에서만 · `reason`·`result`·`validation`은 각 150자(선택 `result`도 같다).

식별자·라벨의 대응은 `CONTEXT.md` 「States」. 한국어 상태명(승인대기 등)은 v1/ApcH 시절
이름이며 이 저장소의 DB·MCP·템플릿에는 없다.

## 보드 기록 규약

출처: ApcH `PROJECT_BOARD.md` 안내 블록(`de25a1c`). 그 블록은 v2에서 서버 규칙과
웹 도움말로 나뉘었고, 아래는 **사람이 읽어야 하는 규약** 쪽이다.

### 인수 다섯 조건

`done` 기록은 재현 검증 후에 받아들인다. 다섯 다 에이전트의 보고가 아니라 **직접 본 것**이어야 한다.

1. 변경 파일 목록 ↔ 계획서 「고칠 파일」
2. diff ↔ 계획서 「구현 스케치」
3. 검증 명령 직접 재실행
4. 백로그에서 그 항목이 제거됐는지 확인 — v2에서는 서버가 `removedAt`을 채우므로
   웹 백로그 화면이나 `backlog_list`로 확인한다
5. `결과`가 가리키는 상세 기록(`docs/agents/<행위자>/<항목ID>.md`)의 실재 확인

### `검증:` 줄 형식

```text
검증: 클린 패스 (YYYY-MM-DD, 무편집 N라운드)
```

메인 루프가 **무편집 클린 패스가 나왔을 때만** 쓴다. 결재함이 이 줄의 **존재만으로**
판정하므로(있으면 통과 칩, 없으면 「검증 전」) 클린 패스가 아닌데 쓰면 거짓 통과가 된다.
v2에서는 `validation_record`가 `in_review`에서만 받고, 되돌리기·재개 시 서버가 지운다.

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
