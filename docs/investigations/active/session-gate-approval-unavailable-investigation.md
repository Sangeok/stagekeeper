---
status: "active"
created-at: "2026-11-12"
completed-at: null
owners: ["Sangeok"]
related:
  - "docs/architecture/protocol.md (MCP 도구 계약 — 소유자 토큰 스코프)"
  - "docs/architecture/invariants.md (세션 채널의 게이트)"
  - "plugin/templates/en/CLAUDE.runbook.md (Approving from this session)"
  - "plugin/templates/en/CODEX.runbook.md (Approving from this session)"
  - "plugin/skills/init/SKILL.md"
  - "packages/core/plans/entitlement.mjs"
  - "src/server/mcp/owner-tools.ts"
primary-area: "세션 채널 게이트 승인 (harness / harness_owner MCP 연결)"
observed-environments:
  - "macOS (Darwin 25.2.0), Claude Code CLI, 저장소 stagekeeper, 브랜치 harness/plugin-skill-contract-plan"
  - "서버 https://stagekeeper.dev"
conclusion-summary: null
follow-up:
  - "docs/proposals/completed/2026-11-12-board-activity-latest-result.md"
---

# 세션에서 ITEM-09 게이트를 열 수 없었던 원인 조사

## Summary

ITEM-09가 `before-implement` 게이트에서 대기하는데, Claude Code 세션에서는 이 게이트를 열 수 없었다.
게이트 승인은 웹 전용이 아니다. 이 세션에서 막힌 원인은 MCP 설정 두 가지다: `harness_owner` 서버가
등록되어 있지 않고, `harness` 서버는 `HARNESS_TOKEN` 환경 변수가 비어 401로 연결에 실패한다.
플랜(Max)과 ITEM-09의 검증 기록은 확인했고, 소유자의 지시로 웹 Inbox에서 승인해 항목은 인수까지 끝났다.
환경 변수가 비어 있는 이유와, 브라우저를 조작하는 에이전트가 웹 게이트를 열 수 있다는 점의 처리는 남아 있다.

## Problem

- Symptom: 백그라운드 watch가 `STOP: item waits`로 끝났고, 세션에 `mcp__harness__*`와
  `mcp__harness_owner__*` 도구가 하나도 없다.
- User impact: 소유자가 세션에서 "ITEM-09 구현 승인"을 지시해도 실행할 수 없고, `/harness:watch`로
  파이프라인을 이어받을 수도 없다. 웹 Inbox에서 승인해야 진행된다.
- Frequency: 이 세션에서는 항상. 다른 셸이나 Codex 세션에서도 같은지는 아직 불명확.
- Severity: medium. 웹 Inbox라는 우회 경로가 있다.
- Reproduction: 이 저장소에서 Claude Code를 시작하고 `claude mcp list`를 실행한다.
- Environment notes: `harness` 서버는 사용자 범위(User config) 설정이고 헤더가
  `Authorization: Bearer ${HARNESS_TOKEN}`이다.

## Scope

- In scope: 세션 채널 게이트 승인의 전제, 이 기기의 `harness`·`harness_owner` MCP 연결 상태.
- Out of scope: ITEM-09의 계획·구현 내용, 사용량 제한(이미 해제됨), 서버 쪽 게이트 판정 로직 변경.

## Evidence

### Known Facts

watch 로그 (`Watch ITEM-09 after the usage limit reset`, UTC):

- 03:51:11 `verify` / `dispatch` — Claude 사용량 제한(03:51Z까지) 해제 대기.
- 04:17:30 `verify` 실행 중(`working`).
- 04:31:09 `before-implement` / `wait` on `gate`. 이어서 `STOP: item waits`, exit 0.
- templateRelease `id f3273f54`, `hash 3f613150901b`.
- 로그의 `limited` 필드는 끝까지 03:51Z 문구로 남았다. 그 뒤 단계가 실제로 실행됐으므로 표시만
  갱신되지 않은 것으로 보인다(추론).

MCP 연결:

- `claude mcp list`: `harness` (`https://stagekeeper.dev/api/mcp`)는 `Failed to connect`, HTTP 401,
  `invalid_token` / `No authorization provided`.
- `claude mcp get harness`: 헤더가 `Bearer ${HARNESS_TOKEN}`. 세션 환경의 `HARNESS_*` 변수는
  `HARNESS_SERVER`뿐이다. `HARNESS_TOKEN`과 `HARNESS_OWNER_TOKEN`은 없다.
- `harness_owner` 서버는 `claude mcp list`에 없다.

세션 승인의 계약:

- 소유자 서버는 이름 `harness_owner`, 엔드포인트 `/api/mcp/owner`, 소유자 토큰(`ho_`)만 받는다.
  도구는 `gate_approve` 하나다 (`src/server/mcp/owner-tools.ts`의 `OWNER_TOOL_NAMES`).
- `sessionApprovals`는 Free `false`, Pro·Max `true` (`packages/core/plans/entitlement.mjs`).
- 세션 채널의 `before-implement` 승인은 검증 기록과 `planCommit` 일치가 필요하다. 웹 Inbox는 그
  전제 없이 승인할 수 있다 (`protocol.md`, `invariants.md`).
- `/harness:init`은 `HARNESS_OWNER_TOKEN`이 설정되어 있을 때만 `harness_owner`를 등록한다
  (`plugin/skills/init/SKILL.md`).
- 런북은 소유자가 항목과 게이트를 직접 말한 문장에만 `gate_approve`를 호출하게 한다. Codex 런북도
  같다. Codex 하위 에이전트는 `harness_owner`가 꺼져 있다 (`plugin/runtime/codex-agent.mjs`).
- 에이전트 서버에 없는 웹 전용 동작 (`src/server/mcp/tools.test.mjs`의 `WEB_ONLY`): 되돌리기·보류·
  폐기·재개, 백로그 수정·삭제, 인수 재시도, 파이프라인 편집과 항목 파이프라인 변경, 토큰 발급.

승인과 그 뒤(2026-11-12, 웹 History):

- 프로젝트는 `stagekeeper-macos-e2e`이고 소유자 플랜은 Max다.
- 04:30 검증 기록(`Validation recorded`). Inbox 카드는 `Verified`, 계획 커밋 `65b9f83`.
- 04:43 `human` `in_review → implementing`. 소유자가 대화에서 "승인해"라고 지시했고, 에이전트가 소유자의
  로그인된 Chrome에서 Inbox의 `Approve implementation`을 눌렀다. 원장에는 사람의 웹 승인으로 남았다.
- 04:59 구현 보고 `2db7fbb`, 05:00 `implementing → done`과 인수 기록 `a0cc9ff`, 05:02 런 완료.
- 러너 로그(`.git/harness/background.log`): 04:57:27 실행 시작, 05:02:12 `done: 26 turns, 0 denied`.
  러너는 이 세션의 MCP 설정과 별개의 자격으로 서버와 통신한다.

### Unknowns

- `HARNESS_TOKEN`이 이 세션에서 비어 있는 이유(셸 프로필에 없는지, 이 실행 경로만 못 읽는지).
  watch 명령은 같은 기기에서 서버와 통신했으므로 다른 자격 경로가 있을 수 있다.
- Codex 설정(`~/.codex/config.toml`)에 `harness`·`harness_owner`가 등록되어 있는지.

## Hypotheses

| ID | 가설 | 근거 | 확인 방법 | 현재 판단 |
| --- | --- | --- | --- | --- |
| H1 | 게이트 승인은 웹에서만 가능하다 | 세션에 승인 도구가 없음 | 아키텍처 문서와 소유자 서버 코드 확인 | ruled-out |
| H2 | `harness_owner`가 등록되지 않아 `gate_approve`가 없다 | `claude mcp list`에 없음, `HARNESS_OWNER_TOKEN` 없음 | 소유자 토큰 설정 후 `/harness:init`, 재시작 뒤 도구 목록 확인 | confirmed |
| H3 | `HARNESS_TOKEN`이 비어 `harness`가 401로 실패한다 | 헤더가 환경 변수 참조, 변수 없음, 오류가 `No authorization provided` | 변수 설정 후 재시작해 연결 확인 | likely |
| H4 | 플랜이 Free라 세션 승인이 거부된다 | Free는 `sessionApprovals: false` | 웹에서 플랜 확인 또는 `gate_approve` 거부 사유 확인 | ruled-out |
| H5 | 검증 기록이 없어 세션 승인이 거부된다 | 세션 채널은 검증 기록 필수 | `board_get`으로 ITEM-09 확인 | ruled-out |

## Verification

| 확인 항목 | 관련 가설 | 방법 또는 데이터 | 판단 기준 | 결과 | 해석 |
| --- | --- | --- | --- | --- | --- |
| 세션 승인 경로 존재 | H1 | `protocol.md` 소유자 토큰 절, `owner-tools.ts` | `gate_approve`가 소유자 서버에 있으면 배제 | 있음 | 웹 전용이 아니다 |
| 소유자 서버 등록 | H2 | `claude mcp list`, `env` | 목록에 없으면 지지 | 없음, 토큰 변수도 없음 | 이 세션에서 승인 도구가 없는 직접 원인 |
| 에이전트 서버 인증 | H3 | `claude mcp get harness`, `env` | 변수 설정 뒤 연결되면 확정 | 변수 없음까지 확인. 설정 후 재연결은 Not verified yet | 빈 Bearer 헤더가 유력 |
| 플랜 | H4 | 웹 Projects 화면 | Free면 지지 | `4 repositories connected on the Max plan` | 플랜은 세션 승인을 막지 않는다 |
| 검증 기록 | H5 | 웹 Inbox 카드와 History | 검증 기록이 없으면 지지 | 04:30 `Validation recorded`, 카드 `Verified` | 검증 기록은 세션 승인을 막지 않는다. `gate_approve` 호출 자체는 해 보지 않았다 |

## Conclusion

- Current conclusion: 게이트 승인은 웹 전용이 아니다. 이 세션에서 못 여는 원인은 `harness_owner`
  미등록(확인)과 `HARNESS_TOKEN` 누락(유력)이다. 플랜과 검증 기록은 원인이 아니다. ITEM-09는 웹 Inbox
  승인으로 진행돼 인수까지 끝났다.
- Remaining uncertainty: `HARNESS_TOKEN`이 비어 있는 이유. 변수를 설정한 뒤의 재연결은 확인하지 않았다.

## Observations

조사 중에 본 것 가운데 이 문서의 원인과 별개인 사항:

- **웹 게이트를 브라우저 조작 에이전트가 열 수 있다.** 불변식 4의 판별 기준은 "그 경로를 실행할 수 있는
  주체가 사용자로 한정되는가"다(`docs/architecture/invariants.md:16`). 소유자의 로그인된 브라우저를 다루는
  에이전트가 있으면 웹 경로는 이 기준을 스스로 지키지 못한다. 세션 채널은 검증 기록과 `planCommit` 일치를
  서버가 확인하고 원장에 `channel: "session"`을 남기지만, 웹 경로에는 그 확인과 구분이 없다. 04:43의 승인이
  그 예다. 코드 결함이 아니라 위협 모델의 결정 사항이다. 결정 필요.
- **보류됐던 항목의 활동 줄이 옛 보류 질문을 보여 준다.** ITEM-09가 완료 뒤에도 `Open: İstanbul…`로
  표시됐다. `docs/proposals/completed/2026-11-12-board-activity-latest-result.md`가 수정안을 다룬다.
- **템플릿 릴리스가 맞지 않는 항목의 대기가 웹에 드러나지 않는다.** ITEM-06과 ITEM-08이 해당한다. 같은
  제안서의 "범위 밖 관찰"에 근거를 적었다.

## Follow-up Actions

이 문서를 `completed/`로 옮기려면 위 웹 게이트 관찰의 결정을 ADR이나 issue로 연결해야 한다. 그 전까지
`active/`에 둔다.

세션에서 승인하려면:

1. 웹 Tokens 탭에서 소유자 토큰(`ho_`)을 발급한다.
2. 셸 프로필에 `HARNESS_TOKEN`과 `HARNESS_OWNER_TOKEN`을 설정한다. 값은 저장소에 두지 않는다.
3. `/harness:init`을 실행하고 Claude Code를 다시 시작한다. `claude mcp list`에서 두 서버가
   연결됐는지 본다.
4. `board_get`으로 항목의 `planCommit`과 검증 기록을 확인한 뒤, 소유자가 항목과 게이트를 말하면
   `gate_approve`를 호출한다.
5. 서버가 검증 기록 없음이나 Free 플랜으로 거부하면 웹 Inbox에서 승인한다.

승인 뒤에는 `/harness:watch`로 이 세션이 파이프라인을 이어받는다.

## Review Checklist

- [x] 모든 `TODO`를 처리했고, 빈 값은 "없음" 또는 "아직 불명확"처럼 이유가 드러나게 남겼다.
- [x] `status`는 `active` 또는 `completed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다. `active/`는 `active`, `completed/`는 `completed`다.
- [x] `owners`, `related`, `primary-area`, `observed-environments`를 현재 조사에 맞게 채웠거나 빈 값으로 둘 이유가 명확하다.
- [x] 증상, 사용자 영향, 발생 빈도, 심각도, 재현 조건, 환경 메모가 구분되어 있다.
- [x] 코드로 확인된 사실과 런타임에서 확인해야 하는 사실이 분리되어 있다.
- [x] 주요 가설마다 ID, 근거, 확인 방법이 있고, 현재 판단은 README의 가설 판단값을 사용했다.
- [x] Verification 표에 관련 가설 ID, 확인 방법, 판단 기준, 결과, 해석을 기록했다.
- [ ] 후속 조치가 필요하면 proposal, ADR, dependency 문서 또는 issue/PR로 연결했다. (활동 줄은 연결함. 웹 게이트 결정은 미연결)
- [ ] 완료 문서라면 `completed-at`, `conclusion-summary`, `follow-up`이 실제 조사 결과와 일치한다.
