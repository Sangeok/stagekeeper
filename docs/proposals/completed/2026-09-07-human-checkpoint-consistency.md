---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-09-07"
approved-by: "HamSangEok"
approved-at: "2026-09-07"
approval-scope: "A~D 전부, Phase 1~5. Open Questions의 권고안을 결정으로 포함"
completed-at: "2026-09-07"
verification-summary: "npm test 112/112 · npm run test:web 153/153 · npm run check exit 0(기존 lint 경고 1건) · npm run test:templates 16/16 · 마이그레이션 2건 적용 · 사이클 회귀 실측 PASS(docs/test-reports/completed/2026-09-07-human-checkpoint-cycle-regression.md, 필수 10항목 통과, 실행 중 결함 2건 수정)"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/protocol.md"
  - "docs/architecture/invariants.md"
  - "docs/conventions/product-copy.md"
  - "CONTEXT.md"
  - "docs/test-reports/completed/2026-09-06-template-change-cycle-regression.md"
  - "docs/test-reports/completed/2026-09-01-phase-1-smoke-acceptance.md"
  - "docs/proposals/completed/2026-09-05-agent-next-open-routing.md"
---

# 사람 확인 지점의 서버 일관성 — 인수·핸드오프·검증 기록·승인 대상

## Summary

이 제품의 핵심은 "특정 지점마다 사람의 확인을 받는다"이고, 그 확인은 프롬프트가 아니라
**서버가 강제**한다는 것이 설계 원칙이다(`invariants.md` 불변식 4, `rationale.md`). 사용자가
한 사이클에서 실제로 멈춰 서는 지점을 전부 세어 보니 5~6회인데, 그 중 서버가 아는 것은
게이트①·② 두 번뿐이었다. 나머지 지점을 세 차례 검증한 결과 **확실한 문제 넷**이 남았다.

| ID | 문제 | 우선순위 |
| --- | --- | --- |
| A | **인수(Acceptance)가 상태 기계에 없다.** `done`은 dev가 찍고, 사람의 인수(런북 7단계)는 서버에 흔적이 없으며, `done`에서 나가는 전이가 없어 인수 실패 시 새 키를 파는 것 외에 경로가 없다. 카피(`product-copy.md:60`)는 `done`을 "Finished and accepted"라고 말해 이 사실을 감춘다 | Must |
| B | **커밋 핸드오프 동안 원장·배너가 침묵한다.** 사이클당 2~3회 오는 정지인데 `AgentRunStep`에 아무 행도 남지 않고 배너는 "Agents are working"이라고 말한다 | Should |
| C | **검증 기록만 서버 검사가 없다.** `report_submit`은 verify 원장을 요구하는데 `validation_record`는 상태와 150자만 본다. 게이트②의 근거가 프롬프트("writing it otherwise is a false pass")에만 기댄다 | Should |
| D | **승인 대상이 문서마다 다르다.** 런북은 "기록된 커밋"을, `dev.md` B-1은 "디스크의 파일"을 승인 대상이라 하고, 서버는 둘이 같은지 검사하지 않으며, 웹 링크는 브랜치 HEAD를 연다 | Should |

이 문서는 넷을 **하나의 원칙**("사람 확인 지점의 증거는 서버에 남고, 서버가 그 증거로 판정한다")
아래 묶어 최소 변경으로 닫는 구현 전 제안서다. 새 상태·새 도구·결제·GitHub App은 추가하지 않는다.
DB 변경은 `BoardItem.acceptedAt` 열 하나(nullable, additive)뿐이다.

## Goal

- 인수 실패의 출구를 상태 기계에 만들고, 인수 증거가 서버에 남게 한다(A).
- 핸드오프 정지를 원장에 남기고 배너가 "당신 차례"라고 말하게 한다(B).
- `validation_record`를 `report_submit`과 같은 방식으로 원장 증거에 묶는다(C).
- 승인 대상을 **기록된 커밋** 하나로 정하고 문서·에이전트·링크를 그에 맞춘다(D).
- 작업 유형: 순수 규칙 확장, 서버 저장 규칙 변경, 스키마 열 추가, 문서·템플릿 갱신, 웹 소폭 변경.

## Proposal Size

`proposal-size`: `standard`

선택 근거:

- 마이그레이션 1건(`BoardItem.acceptedAt`), MCP 응답·도구 계약 변경(`agent_next` outcome, `board_get` 필드), 5개 이상 파일 변경.
- 롤백이 단순 revert 이상이다 — private 템플릿 재시드와 nullable 열이 남는다.

## Current State

검토일 2026-09-07, 기준 `dev` `a9b4bf2`. 아래는 전부 읽어서 확인한 현재 코드다.

### A. 인수

- `packages/core/transitions.mjs:8-23` `RULES` — `from: "done"`인 규칙이 없다. `transitions.test.mjs`의
  `"nothing leaves done"` 테스트가 이것을 고정한다.
- `src/server/pipeline/board.ts:132` — `done` 전이 시 `backlogItem.removedAt`을 채운다.
  `src/fsd/features/edit-backlog/api/edit-backlog.server.ts:80`은 `removedAt`을 **찍기만** 하고 지우는 액션이 없다.
  `prisma/schema.prisma` `BacklogItem`은 `@@unique([projectId, key])`라 같은 키를 다시 넣을 수 없고,
  `decidePropose`는 `backlogExists`(= `removedAt === null`)를 요구한다. 인수에서 결함이 나오면 **경로가 없다.**
- 서버는 인수 기록 **채널을 이미 열어 두었다**: `board-rules.ts:76` `REPORT_SUBMIT_STATUSES`에 `done`이 있고
  주석이 "인수 기록(done)"이라 부르며, `MAIN_LOOP`(`:81`)를 보고 행위자로 인정한다. 템플릿
  `docs/agents/README.md`도 "`done` (acceptance records)"라고 쓴다. 그런데 런북 7단계는 `report_submit`을
  지시하지 않고, 실제 사이클(스모크 E17)의 원장에도 `done` 상태의 보고 이벤트가 없다 — 인수 증거는 저장소 git에만
  남았다(`docs/agents/main-loop/FEAT-01.md`).
- 웹은 이 공백을 **알고 있다**: `src/fsd/entities/board-item/model/journey.ts:3-5` 주석 —
  "보드 데이터만으로는 done의 '인수됨'(메인 루프 몫)도 … 결정할 수 없어 여정 밖으로 뺀다". 7단계 여정의
  `Accepted`(actor `loop`)는 `currentIndexFor`가 5까지만 매핑해 **도달 불가능**하다.
- 그런데 `docs/conventions/product-copy.md:60`은 `done` = "Finished and accepted", `CONTEXT.md` States는
  "끝났고 인수됐다"라고 쓴다. 코드 주석과 제품 카피가 서로 다른 말을 한다.
- 웹 `done` 항목은 Inbox에 오르지 않고(`gate-source.ts` `needsHumanDecision`은 gate·resume만), 배너는
  "Nothing open"이다(`turn.ts`). 사람이 인수를 건너뛰어도 아무것도 말하지 않는다.

### B. 핸드오프

- `src/server/agents/next.ts:22` `OUTCOMES = ["ok", "blocked", "failed"]`. `dev.md:66-67`(스텁 영역)
  "Commit handoff: … **stop without an outcome**; keep the current step and board state". 정지 동안
  `AgentRunStep`에 행이 없고, 해소 뒤 재개 호출의 `ok`에 `Handoff resolved: …` 노트가 실린다(회귀 보고서).
- `src/fsd/widgets/turn-banner/model/turn.ts:133` — `planning`·`implementing`이면 무조건 `kind: "theirs"`
  ("Agents are working"). `loadTurn`(`api/turn-data.server.ts`)은 `latestBoard`만 읽고 run을 보지 않는다.
- 실측: 2026-09-06 회귀 보고서 F-A — 정지가 고장으로 읽혔다(런북 문구로 수정됨, `70ae0a9`). Deviations —
  "원장에서 run이 열려 있는 것도 '죽었다'로 읽었으나 진행 중일 수도 있다는 뜻이었다". 원장은 멈춤·진행·죽음을
  구분하지 못한다. (중복 실행·$3.9는 출력 파일 크기 오판이 원인이지 핸드오프가 아니다 — 이 제안의 근거로 삼지 않는다.)

### C. 검증 기록

- `src/server/pipeline/board-rules.ts:60-64` `decideValidation(status, text)` — `in_review`와 150자만 본다.
- 같은 파일 `decideReportSubmit`(`:101`)은 `implementing`에서 `AgentRunStep{stepId:"verify"}`를 요구한다 —
  "보고 전에 검증을 **시도**했다"를 원장으로 증명하는 벽. 검증 기록에는 대칭 벽이 없다.
- 방어선은 클라이언트에만 있다: 스텁 5종(`pm`·`dev`·`plan-verifier`·`doc-auditor`·`feature-scout`)의 `tools:`에
  `validation_record`가 없다. 쓸 수 있는 것은 메인 루프(사용자 세션의 Claude)뿐이고, 정직성은 런북 4단계 문구에 기댄다.
- 그 메인 루프가 자기 결함을 못 본 실측이 `rationale.md`에 있다("자기 문장은 검사 대상으로 보이지 않는다") —
  `plan-verifier`가 존재하는 이유다.
- 서버 검사에 필요한 재료는 이미 있다: `src/server/agents/runs.ts:50-51` `verifyOk`가
  `{stepId:"verify", outcome:"ok", run:{projectId, agent, key}}`를 조회하고, `plan-verifier.md:96`의 단계 id도
  `verify`다. `plan_submit`은 `TransitionEvent{note:"plan"}`을 남기므로(`board.ts:185`) "마지막 제출 뒤"도 잴 수 있다.
- Free 플랜은 `plan-verifier`가 없고(`entitlement.mjs` `LIMITS.free.agents`), Free 런북은 "there is no independent
  verification pass … the inbox shows no validation record"라고 쓴다. 그런데 서버는 Free에서도 `validation_record`를 받는다.

### D. 승인 대상

- 런북 4단계: "the commit on record must be the one the owner approves at gate 2" → 승인 = `planCommit`.
- `dev.md:176-177` B-1: "the owner may have edited it before approving, and **that edit is what was approved**"
  → 승인 = 디스크 파일. 런북은 **검증 라운드**의 편집만 재제출을 요구하고 소유자 편집은 언급하지 않는다.
- 서버: `board.ts:112` `transition`은 `decideTransition`(status·planPath·validation)과 `expectedUpdatedAt` CAS만
  본다. `planCommit`을 아무것과도 대조하지 않는다. dev B-1도 대조하지 않는다.
- 웹: `src/fsd/entities/board-item/model/doc-link.ts:8-10` `blobHref`가 `Project.branch`로 링크를 만든다.
  카드는 `planCommit` 7자를 **표시**하면서(`inbox-card.tsx` `PlanRow`) 링크는 다른 리비전을 연다.
  `Report`에도 `commit`이 있지만 링크에 쓰이지 않는다.
- (정정) 비공개 저장소에서 링크가 안 열린다는 앞선 판단은 틀렸다 — `github.ts`의 제약은 서버 API 읽기 얘기고,
  브라우저 링크는 소유자의 GitHub 로그인으로 열린다.

## Scope

포함 범위:

- `packages/core/transitions.mjs` 상태 기계(reopen 규칙 2개)와 `plugin/lib` 복사본
- `src/server/pipeline/board-rules.ts`·`board.ts` — reopen·인수 표시·검증 벽
- `prisma/schema.prisma` `BoardItem.acceptedAt` + 마이그레이션
- `src/server/agents/next.ts` — outcome `handoff`; `src/server/mcp/tools.ts` 설명 문구
- 웹: 배너(핸드오프·인수 대기), 항목 상세의 Reopen, 커밋 고정 링크, 문서 라벨, journey 매핑
- 문서: `protocol.md`·`invariants.md`·`CONTEXT.md`·`product-copy.md`
- private 템플릿: `CLAUDE.runbook.md`(+free)·`agents/dev.md`·`docs/agents/README.md` + 재시드

제외 범위:

- 새 상태(`accepted`) 추가, 웹 "Accept" 버튼(게이트③) — 대안 분석에서 기각
- 열린 run이 **진행 중인지 죽었는지**의 판별(마지막 활동 시각 표시) — 별도 후속
- Free 플랜에 검증 대체 수단 제공 — 플랜 설계의 일
- 앞선 검토에서 철회한 항목: 범위 밖 의존의 카드 표시, Send back 사유 필수화, init 재시작 안내
- GitHub App(계획서 본문 표시), 결제, Phase 3

## Proposal

### A. 인수를 상태 기계에 들인다 — 증거는 기존 채널, 출구는 사람 전이

**A-1. 인수 증거 = `report_submit({ actor: "main-loop" })` in `done`.** 서버가 이미 받는다. 런북 7단계에
다섯 조건 재현 뒤 `docs/agents/main-loop/<KEY>.md`에 인수 절을 쓰고 커밋한 다음 이 호출을 하도록 **명시**한다.
새 도구를 만들지 않는 이유: 증거 제출 3종이 전부 same-status 이벤트로 남는 현재 규약(불변식 8)과 같고,
`AGENT_TOOL_NAMES`·`tools.test.mjs`를 건드리지 않는다.

**A-2. 서버가 인수를 표시한다 — `BoardItem.acceptedAt`.** `decideReportSubmit`이 `{ accepts }`를 돌려주고
(`done` + `main-loop`일 때 true), `submitReport`가 그 값으로 `acceptedAt`을 찍는다. `validation` 열이
`validation_record`로 채워지는 것과 같은 패턴이다. 숨은 부수효과가 되지 않도록 판정은 **순수 함수의 반환값**에 드러낸다.

`prisma/schema.prisma` — `BoardItem`에 한 줄:

```prisma
  validation    String?                   // 검증: — 검토대기에서만, 되돌리기 시 null
  acceptedAt    DateTime?                 // 인수: done에서 main-loop의 report_submit이 찍는다. reopen 시 null
```

`src/server/pipeline/board-rules.ts` — `decideReportSubmit`

Before:

```ts
export function decideReportSubmit(i: ReportSubmitInput): Decision<null> {
  if (!REPORT_SUBMIT_STATUSES.has(i.status)) {
    return { ok: false, reason: `report_submit only in in_review, implementing, or done (now ${i.status})` };
  }
  if (!knownReporter(i.actor, i.roster)) return { ok: false, reason: `unknown reporter: ${i.actor}` };
  // 문구가 원인까지 말한다. 이 벽에 걸리는 흔한 경우는 "검증을 건너뛴 에이전트"가 아니라
  // **Phase 4 이전에 init한 프로젝트**다 — 통짜 본문 파일을 그대로 들고 있으면 agent_next를 부르지 않아
  // 원장에 verify가 남지 않는다. 그 사용자에게 필요한 다음 행동은 재검증이 아니라 /harness:init 재실행이다.
  if (i.status === "implementing" && !i.hasVerifyStep) {
    return {
      ok: false,
      reason:
        `verify step not recorded for \`${i.actor}\` on this item` +
        " — record the verify step through agent_next before reporting." +
        " If the agent files still carry full step bodies, rerun /harness:init to get stubs.",
    };
  }
  return { ok: true, value: null };
}
```

After:

```ts
// 보고가 인수 기록인가 — done에서 main-loop이 낸 보고만. 값으로 드러내야 board.ts의 acceptedAt 쓰기가
// "report_submit의 숨은 부수효과"가 아니라 "판정의 결과"가 된다(decideTransition의 completes와 같은 자리).
export type ReportSubmitPatch = { accepts: boolean };

export function decideReportSubmit(i: ReportSubmitInput): Decision<ReportSubmitPatch> {
  if (!REPORT_SUBMIT_STATUSES.has(i.status)) {
    return { ok: false, reason: `report_submit only in in_review, implementing, or done (now ${i.status})` };
  }
  if (!knownReporter(i.actor, i.roster)) return { ok: false, reason: `unknown reporter: ${i.actor}` };
  // 문구가 원인까지 말한다. 이 벽에 걸리는 흔한 경우는 "검증을 건너뛴 에이전트"가 아니라
  // **Phase 4 이전에 init한 프로젝트**다 — 통짜 본문 파일을 그대로 들고 있으면 agent_next를 부르지 않아
  // 원장에 verify가 남지 않는다. 그 사용자에게 필요한 다음 행동은 재검증이 아니라 /harness:init 재실행이다.
  if (i.status === "implementing" && !i.hasVerifyStep) {
    return {
      ok: false,
      reason:
        `verify step not recorded for \`${i.actor}\` on this item` +
        " — record the verify step through agent_next before reporting." +
        " If the agent files still carry full step bodies, rerun /harness:init to get stubs.",
    };
  }
  return { ok: true, value: { accepts: i.status === "done" && i.actor === MAIN_LOOP } };
}
```

보존해야 하는 불변: 거부 조건과 문구는 바이트 동일하다 — 바뀌는 것은 성공 시 반환값뿐이다.

`src/server/pipeline/board.ts` — `submitReport`

Before:

```ts
export async function submitReport(projectId: string, input: { key: string; actor: string; path: string; commit: string }, actorRef: string) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    // 벽에 필요한 사실 둘. roster는 이름 검사에, verify 원장은 implementing의 선행 검사에 쓴다.
    // verify 조회는 status가 implementing일 때만 한다 — 나머지 상태에선 결과를 쓰지 않으므로 왕복을 아낀다.
    const roster = (await tx.workspace.findMany({ where: { projectId }, select: { agent: true } })).map((w) => w.agent);
    const hasVerifyStep =
      row.status === "implementing" &&
      (await tx.agentRunStep.findFirst({
        where: { stepId: "verify", run: { projectId, agent: input.actor, key: input.key } },
        select: { id: true },
      })) !== null;
    const d = decideReportSubmit({ status: row.status, actor: input.actor, roster, hasVerifyStep });
    if (!d.ok) return fail(d.reason);
    const report = await tx.report.create({ data: { boardItemId: row.id, actor: input.actor, path: input.path, commit: input.commit } });
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: row.status, actor: "agent", actorId: actorRef, note: "report" } });
    return { ok: true as const, item: report };
  });
}
```

After:

```ts
export async function submitReport(projectId: string, input: { key: string; actor: string; path: string; commit: string }, actorRef: string) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    // 벽에 필요한 사실 둘. roster는 이름 검사에, verify 원장은 implementing의 선행 검사에 쓴다.
    // verify 조회는 status가 implementing일 때만 한다 — 나머지 상태에선 결과를 쓰지 않으므로 왕복을 아낀다.
    const roster = (await tx.workspace.findMany({ where: { projectId }, select: { agent: true } })).map((w) => w.agent);
    const hasVerifyStep =
      row.status === "implementing" &&
      (await tx.agentRunStep.findFirst({
        where: { stepId: "verify", run: { projectId, agent: input.actor, key: input.key } },
        select: { id: true },
      })) !== null;
    const d = decideReportSubmit({ status: row.status, actor: input.actor, roster, hasVerifyStep });
    if (!d.ok) return fail(d.reason);
    const report = await tx.report.create({ data: { boardItemId: row.id, actor: input.actor, path: input.path, commit: input.commit } });
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: row.status, actor: "agent", actorId: actorRef, note: "report" } });
    // 인수 기록이면 항목에 표시한다 — 배너·항목 상세·journey가 이 열 하나로 "인수됐나"를 읽는다.
    if (d.value.accepts) await tx.boardItem.update({ where: { id: row.id }, data: { acceptedAt: report.at } });
    return { ok: true as const, item: report };
  });
}
```

**A-3. 인수 실패의 출구 — 사람 전이 `done → implementing | planning`(kind `reopen`).** 사유(`result`) 필수.
같은 트랜잭션에서 `backlogItem.removedAt = null`(백로그 복원)과 `acceptedAt = null`을 처리한다.
`planning`으로 가면 `validation`도 지운다(되돌리기와 같은 뜻). 에이전트에게는 이 전이가 없다.

`packages/core/transitions.mjs` — `RULES`

Before:

```js
const RULES = [
  // 사람(웹 로그인)만 — 게이트
  { from: "proposed", to: "planning", actor: "human", kind: "gate" },
  { from: "in_review", to: "implementing", actor: "human", kind: "gate" },
  // 사람 — 되돌리기·보류·재개 (ApcH REJECT_TRANSITIONS + 보드 안내 블록 재개 규칙)
  { from: "in_review", to: "planning", actor: "human", kind: "bounce", clearsValidation: true },
  { from: "proposed", to: "on_hold", actor: "human", kind: "hold", requiresResult: true },
  { from: "in_review", to: "on_hold", actor: "human", kind: "hold", requiresResult: true },
  { from: "on_hold", to: "planning", actor: "human", kind: "resume", clearsValidation: true },
  { from: "on_hold", to: "implementing", actor: "human", kind: "resume" },
  // 에이전트(MCP 토큰) — dev A-4·B-6
  { from: "planning", to: "in_review", actor: "agent", kind: "plan", requiresPlan: true },
  { from: "planning", to: "on_hold", actor: "agent", kind: "hold", requiresResult: true },
  { from: "implementing", to: "done", actor: "agent", kind: "done", requiresResult: true, requiresReport: true },
  { from: "implementing", to: "on_hold", actor: "agent", kind: "hold", requiresResult: true },
];
```

After:

```js
const RULES = [
  // 사람(웹 로그인)만 — 게이트
  { from: "proposed", to: "planning", actor: "human", kind: "gate" },
  { from: "in_review", to: "implementing", actor: "human", kind: "gate" },
  // 사람 — 되돌리기·보류·재개 (ApcH REJECT_TRANSITIONS + 보드 안내 블록 재개 규칙)
  { from: "in_review", to: "planning", actor: "human", kind: "bounce", clearsValidation: true },
  { from: "proposed", to: "on_hold", actor: "human", kind: "hold", requiresResult: true },
  { from: "in_review", to: "on_hold", actor: "human", kind: "hold", requiresResult: true },
  { from: "on_hold", to: "planning", actor: "human", kind: "resume", clearsValidation: true },
  { from: "on_hold", to: "implementing", actor: "human", kind: "resume" },
  // 사람 — 인수 실패의 출구. done은 "dev가 끝났다고 보고했다"이지 인수가 아니다(인수 = acceptedAt).
  // 사유 필수. 백로그 복원(removedAt = null)과 acceptedAt = null은 board.ts가 같은 트랜잭션에서 한다.
  { from: "done", to: "implementing", actor: "human", kind: "reopen", requiresResult: true },
  { from: "done", to: "planning", actor: "human", kind: "reopen", requiresResult: true, clearsValidation: true },
  // 에이전트(MCP 토큰) — dev A-4·B-6
  { from: "planning", to: "in_review", actor: "agent", kind: "plan", requiresPlan: true },
  { from: "planning", to: "on_hold", actor: "agent", kind: "hold", requiresResult: true },
  { from: "implementing", to: "done", actor: "agent", kind: "done", requiresResult: true, requiresReport: true },
  { from: "implementing", to: "on_hold", actor: "agent", kind: "hold", requiresResult: true },
];
```

`isOpen(done)`은 그대로 false다 — reopen된 항목은 목적지 상태로 다시 열린다. `plugin/lib/transitions.mjs`는
`npm run sync:plugin-lib`로 같게 만든다(`npm run check`의 첫 단계가 드리프트를 잡는다).

`src/server/pipeline/board-rules.ts` — `TransitionPatch`·`decideTransition`

Before:

```ts
export type TransitionPatch = { status: string; results: string[]; validation: string | null; completes: boolean };

export function decideTransition(row: RowSnapshot, actor: Actor, to: string, result: string | undefined): Decision<TransitionPatch> {
  const rule = findRule(actor, row.status, to) as Rule | null;
  if (!rule) return { ok: false, reason: `not allowed: ${actor} ${row.status} → ${to}` };
  // 필수든 선택이든, 온 result는 150자 예산을 지킨다(되돌리기 노트가 선택 result로 들어온다).
  if (rule.requiresResult || result !== undefined) { const bad = checkText("result", result); if (bad) return { ok: false, reason: bad }; }
  if (rule.requiresPlan && !row.planPath) return { ok: false, reason: "plan_submit first" };
  if (rule.requiresReport && row.reportCount === 0) return { ok: false, reason: "report_submit first" };
  return { ok: true, value: {
    status: to,
    results: result ? [...row.results, result] : row.results,
    validation: rule.clearsValidation ? null : row.validation,
    completes: to === "done",
  } };
}
```

After:

```ts
// reopens: done에서 돌아가는 사람 전이. completes의 역이다 — 백로그를 복원하고 인수 표시를 지운다(board.ts).
export type TransitionPatch = { status: string; results: string[]; validation: string | null; completes: boolean; reopens: boolean };

export function decideTransition(row: RowSnapshot, actor: Actor, to: string, result: string | undefined): Decision<TransitionPatch> {
  const rule = findRule(actor, row.status, to) as Rule | null;
  if (!rule) return { ok: false, reason: `not allowed: ${actor} ${row.status} → ${to}` };
  // 필수든 선택이든, 온 result는 150자 예산을 지킨다(되돌리기 노트가 선택 result로 들어온다).
  if (rule.requiresResult || result !== undefined) { const bad = checkText("result", result); if (bad) return { ok: false, reason: bad }; }
  if (rule.requiresPlan && !row.planPath) return { ok: false, reason: "plan_submit first" };
  if (rule.requiresReport && row.reportCount === 0) return { ok: false, reason: "report_submit first" };
  return { ok: true, value: {
    status: to,
    results: result ? [...row.results, result] : row.results,
    validation: rule.clearsValidation ? null : row.validation,
    completes: to === "done",
    reopens: rule.kind === "reopen",
  } };
}
```

`RuleKind`에 `"reopen"`을 더한다 — 이 파일(`:12`)과 `src/fsd/features/review-gate/model/gate-source.ts:10` 두 곳.
`gate-source.test.ts`의 `DECLARED`가 `RULES`를 훑어 두 목록을 묶고 있으므로, 한쪽만 고치면 그 테스트가 깨진다(의도된 안전망).

`src/server/pipeline/board.ts` — `transition`

Before:

```ts
export async function transition(
  projectId: string, input: { key: string; to: string; result?: string }, caller: Caller,
) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const d = decideTransition(
      { status: row.status, planPath: row.planPath, reportCount: row._count.reports, results: row.results, validation: row.validation },
      caller.actor, input.to, input.result,
    );
    if (!d.ok) return fail(d.reason);
    // 낙관적 잠금(ApcH sha 잠금의 대응물). 가드를 비우면 두 에이전트가 같은 행을 동시에 읽고
    // 둘 다 전이해 이벤트가 둘, `결과:`가 두 번 누적된다. 어느 값을 쓰는지는 Caller가 정한다.
    const expected = caller.actor === "human" ? caller.expectedUpdatedAt : row.updatedAt;
    const u = await tx.boardItem.updateMany({
      where: { id: row.id, updatedAt: expected },
      data: { status: d.value.status, results: d.value.results, validation: d.value.validation },
    });
    if (u.count === 0) return fail("stale");
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: d.value.status, actor: caller.actor, actorId: caller.actorRef } });
    if (d.value.completes) await tx.backlogItem.update({ where: { id: row.backlogItemId }, data: { removedAt: new Date() } });
    if (!isOpen(d.value.status)) await closeRuns(tx, projectId, input.key);
    return { ok: true as const, item: await tx.boardItem.findUniqueOrThrow({ where: { id: row.id } }) };
  });
}
```

After:

```ts
export async function transition(
  projectId: string, input: { key: string; to: string; result?: string }, caller: Caller,
) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const d = decideTransition(
      { status: row.status, planPath: row.planPath, reportCount: row._count.reports, results: row.results, validation: row.validation },
      caller.actor, input.to, input.result,
    );
    if (!d.ok) return fail(d.reason);
    // 낙관적 잠금(ApcH sha 잠금의 대응물). 가드를 비우면 두 에이전트가 같은 행을 동시에 읽고
    // 둘 다 전이해 이벤트가 둘, `결과:`가 두 번 누적된다. 어느 값을 쓰는지는 Caller가 정한다.
    const expected = caller.actor === "human" ? caller.expectedUpdatedAt : row.updatedAt;
    const u = await tx.boardItem.updateMany({
      where: { id: row.id, updatedAt: expected },
      // reopen이면 인수 표시를 지운다 — 돌아간 항목은 다시 인수돼야 한다. 다른 전이는 이 열을 건드리지 않는다(undefined).
      data: { status: d.value.status, results: d.value.results, validation: d.value.validation, acceptedAt: d.value.reopens ? null : undefined },
    });
    if (u.count === 0) return fail("stale");
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: d.value.status, actor: caller.actor, actorId: caller.actorRef } });
    if (d.value.completes) await tx.backlogItem.update({ where: { id: row.backlogItemId }, data: { removedAt: new Date() } });
    // completes의 역 — 백로그로 되돌린다. 상한(backlog 축)은 세지 않는다: 추가가 아니라 복원이고, 자리는 done 직전까지 이 항목의 것이었다.
    if (d.value.reopens) await tx.backlogItem.update({ where: { id: row.backlogItemId }, data: { removedAt: null } });
    if (!isOpen(d.value.status)) await closeRuns(tx, projectId, input.key);
    return { ok: true as const, item: await tx.boardItem.findUniqueOrThrow({ where: { id: row.id } }) };
  });
}
```

보존 불변: `reopens`가 false인 모든 전이는 이전과 같은 행을 쓴다(`acceptedAt: undefined`는 Prisma에서 "건드리지 않음").
Free 백로그 상한을 세지 않는 결정은 승인 메모(Approval)에 기록했다.

**A-4. 웹.**

- **인수 대기 배너.** `TurnItem`에 `accepted`를 더하고, `done && !accepted`를 "당신 차례"로 센다. 배너 문구 후보
  (product-copy §5에 들어갈 것, 승인 필요): 헤드라인 **Waiting on you**, 디테일 "FEAT-01 is done — accept it",
  터미널 줄 `Continue the runbook for FEAT-01: step 7 — accept.` 인수된 `done`은 지금처럼 배너를 소유하지 않는다.
- **Reopen은 항목 상세(`/p/<slug>/items/<key>`)에 둔다**, Inbox가 아니라. Inbox에 두면 `needsHumanDecision(done)`이
  참이 되어 모든 `done` 항목이 영원히 결재함에 남는다. `needsHumanDecision`은 gate·resume만 세므로 kind `reopen`은
  자동으로 제외된다 — `rejectActionsFor(done)`도 bounce(kind 불일치)·hold(규칙 없음)·discard(`canDiscard` false)
  모두 없어 Inbox는 바뀌지 않는다. 항목 상세에 `done`일 때만 "Reopen implementation" / "Reopen planning" + 사유 입력(필수,
  `TEXT_LIMIT` 안)을 둔다. 서버 액션은 기존 `humanTransition`(`review-gate.server.ts`)을 그대로 쓴다 — `to`는 상태 기계가 판정한다.
- **문서 라벨.** `done` 상태에서 낸 `main-loop` 보고는 "Validation record"가 아니라 **"Acceptance record"**다.
  `toItemDocs`가 보고의 `at`과 행의 `acceptedAt`으로 가른다(§D의 링크 변경과 같은 파일).
- **journey.** `currentIndexFor(status, validation, accepted)`: `done && !accepted → 6`(Accepted 단계 current,
  waiting "Accepting"), `done && accepted → null`(종결). 스테퍼는 현재 어느 화면도 렌더하지 않으므로(`board-item-page.tsx`는
  `deriveJourney`를 import하지 않는다) 매핑과 주석만 고친다.

`src/fsd/entities/board-item/model/acceptance.ts` (new) — `verification.ts`와 같은 자리, 같은 이유:

```ts
// "이 항목은 인수를 기다리는가" — done이지만 인수 기록(acceptedAt)이 없다. 배너·항목 상세·journey가 같은 답을 쓴다.
export function isAwaitingAcceptance(status: string | null, accepted: boolean): boolean {
  return status === "done" && !accepted;
}
```

`src/fsd/widgets/turn-banner/model/turn.ts` — `TurnItem`·`deriveTurn`·`nextStepLine`(B의 핸드오프와 함께 아래 §B에 한 번에 적는다).

**A-5. 문서·카피.**

- `CONTEXT.md` States `done`: "끝났고 인수됐다" → "dev가 끝났다고 보고했다. 인수 기록(`acceptedAt`)이 오면 인수된 것이다.
  인수에서 결함이 나오면 사람이 되돌린다(Reopen)". 여는 사람 동작 열에 "Reopen implementation · Reopen planning".
- `product-copy.md` §3 `done` = "Finished. Accepted once the acceptance record is in." · Human actions 표에
  `done → implementing` **Reopen implementation** / `done → planning` **Reopen planning**(토스트·칩 문구는 승인 대상) ·
  §5 배너 행 추가 · §11 라벨 "Acceptance record".
- `protocol.md` 상태 기계 표에 reopen 2행, `report_submit` 행에 "`done` + `main-loop` → `acceptedAt`", 인수 절에
  "인수 기록은 `report_submit`으로 서버에 남긴다 — 다섯 조건은 여전히 사람이 직접 재현한다".
- `invariants.md` 「이 저장소가 특히 지키는 것」에 "인수 실패도 행을 지우지 않는다 — reopen은 전이 이벤트로 남고 백로그는 복원된다".
- (private) `CLAUDE.runbook.md` 7단계 끝: "Write the acceptance section in `docs/agents/main-loop/<KEY>.md`, commit,
  then `report_submit({ key, actor: "main-loop", path, commit })`. If a check fails, reopen the item on its page
  (web) with the failing check as the note — implementation if the plan holds, planning if it doesn't."
  Free 판도 같다(인수는 플랜과 무관).

**A의 대안.**

- *Option B — 웹 "Accept" 버튼(게이트③).* 사람 클릭이 `acceptedAt`을 찍는다. 기각: 다섯 조건은 저장소에서만 재현할 수
  있어 클릭은 증거가 아니라 선언이 된다(보드 규칙 1 "증거 없는 상태 주장 금지"와 충돌). 인수의 행위자는 설계상
  메인 루프다(journey의 `loop`, `docs/agents/README.md`의 행위자 표). 나중에 붙이고 싶으면 A-1의 보고를 전제로 두면 된다.
- *Option C — 새 상태 `accepted`.* `STATUSES`·라벨·`isOpen`·백로그 제거 시점·pm의 "open" 셈까지 전부 흔든다. 인수됨은
  "상태"보다 "증거의 유무"라 열 하나가 맞다 — `validation`이 상태가 아닌 것과 같은 이유.

### B. 핸드오프를 원장에 남긴다 — outcome `handoff`

**B-1. `agent_next`에 네 번째 outcome.** 전진도 분기도 하지 않는다 — `AgentRunStep` 한 행을 남기고 지금 단계에
머문다. 재개는 지금처럼 outcome 없는 호출이다. `note`에는 준비된 파일 경로를 싣는다(런북·스텁이 그렇게 지시한다).

`src/server/agents/next.ts`

Before(`:22`):

```ts
export const OUTCOMES = ["ok", "blocked", "failed"] as const;
```

After:

```ts
// handoff: 커밋 권한이 없어 멈췄다 — 전진·분기 없이 원장에 남고 자리에 머문다. 배너가 이 행을 읽는다.
export const OUTCOMES = ["ok", "blocked", "failed", "handoff"] as const;
```

Before(`:143-145`, `agentNext` 안의 outcome 처리 — 이 앞뒤는 바이트 동일):

```ts
  // ... (unchanged)
  const outcome = input.outcome;
  const note = input.note ?? null;
  await deps.record(run.id, { stepId: current.id, outcome, note });

  const candidates = outcome === "ok" ? current.next : outcome === "failed" ? [current.onFailed] : [current.onBlocked];
  // ... (unchanged)
```

After:

```ts
  // ... (unchanged)
  const outcome = input.outcome;
  const note = input.note ?? null;
  await deps.record(run.id, { stepId: current.id, outcome, note });

  // 핸드오프는 라우팅이 아니다 — 원장에 "멈춤"을 남기고 같은 단계를 돌려준다. 템플릿의 `on handoff:`는
  // steps.ts가 모르는 지시어로 거부하므로 분기 경로가 생길 수 없다. 재개는 outcome 없는 호출이다.
  if (outcome === "handoff") {
    return serve(current, `(handoff recorded — you are still on \`${current.id}\`; after the commit, call again without outcome)\n\n`);
  }

  const candidates = outcome === "ok" ? current.next : outcome === "failed" ? [current.onFailed] : [current.onBlocked];
  // ... (unchanged)
```

보존 불변: `ok`·`failed`·`blocked`의 경로는 한 줄도 바뀌지 않는다(조기 반환 뒤 TypeScript가 `outcome`을 셋으로 좁힌다).
`steps.ts`의 `DIRECTIVE`는 `on [a-z-]+:`를 잡아 `unknown directive`로 던지므로 `on handoff:`는 시드 시점에 거부된다 — 별도 변경 없음.
`RATE_LIMIT`은 원장 행 수를 세므로 핸드오프도 1회로 센다(의도).

`src/server/mcp/tools.ts` `agent_next` 설명: "with outcome ok | blocked | failed to finish it and get the next one"
→ "… ok | blocked | failed to finish it and get the next one, or handoff to record a commit handoff and stay on the step".

**B-2. 배너가 읽는다.** `loadTurn`이 열린 run 중 마지막 원장 행이 `handoff`인 것을 key별로 모은다.

`src/fsd/widgets/turn-banner/api/turn-data.server.ts` — `loadTurn`

Before:

```ts
export async function loadTurn(projectId: string): Promise<TurnData> {
  const [rows, tokenCount, workspaceCount, backlogCount] = await Promise.all([
    latestBoard(projectId),
    prisma.projectToken.count({ where: { projectId, revokedAt: null } }),
    prisma.workspace.count({ where: { projectId } }),
    prisma.backlogItem.count({ where: { projectId, removedAt: null } }),
  ]);

  const items = rows.map((r) => ({ key: r.backlogItem.key, status: r.status, agent: r.agent, validation: r.validation }));

  return {
    turn: deriveTurn(items, { tokenIssued: tokenCount > 0, rosterSynced: workspaceCount > 0, backlogCount }),
    inboxCount: pendingInboxCount(items.map((i) => i.status)),
  };
}
```

After:

```ts
export async function loadTurn(projectId: string): Promise<TurnData> {
  const [rows, tokenCount, workspaceCount, backlogCount, openRuns] = await Promise.all([
    latestBoard(projectId),
    prisma.projectToken.count({ where: { projectId, revokedAt: null } }),
    prisma.workspace.count({ where: { projectId } }),
    prisma.backlogItem.count({ where: { projectId, removedAt: null } }),
    // 핸드오프 판정 재료: 항목에 묶인 열린 run의 **마지막** 원장 행. handoff면 dev가 커밋을 기다리며 멈춰 있다.
    prisma.agentRun.findMany({
      where: { projectId, closedAt: null, key: { not: null } },
      select: { key: true, stepId: true, steps: { orderBy: { at: "desc" }, take: 1, select: { outcome: true, note: true } } },
    }),
  ]);

  const handoffs = new Map<string, { step: string; note: string | null }>();
  for (const run of openRuns) {
    const last = run.steps[0];
    if (run.key !== null && last?.outcome === "handoff") handoffs.set(run.key, { step: run.stepId, note: last.note });
  }
  const items = rows.map((r) => ({
    key: r.backlogItem.key, status: r.status, agent: r.agent, validation: r.validation,
    accepted: r.acceptedAt !== null,
    handoff: handoffs.get(r.backlogItem.key) ?? null,
  }));

  return {
    turn: deriveTurn(items, { tokenIssued: tokenCount > 0, rosterSynced: workspaceCount > 0, backlogCount }),
    inboxCount: pendingInboxCount(items.map((i) => i.status)),
  };
}
```

`src/fsd/widgets/turn-banner/model/turn.ts` — `TurnItem`·`deriveTurn`·`nextStepLine`

Before(`:7`, `:92-103`, `:114-145`):

```ts
export type TurnItem = { key: string; status: string; agent: string; validation: string | null };

// ... (unchanged)

// 런북(CLAUDE.runbook.md)의 단계 번호로 말한다 — 세션은 그 문서를 이미 읽고 있다.
export function nextStepLine(item: TurnItem): string | null {
  switch (item.status) {
    case "planning":
      return `Continue the runbook for ${item.key}: step 3 — ${item.agent} writes the plan.`;
    case "in_review":
      return isPlanUnverified(item.status, item.validation) ? `Continue the runbook for ${item.key}: step 4 — verify the plan.` : null;
    case "implementing":
      return `Continue the runbook for ${item.key}: step 6 — ${item.agent} implements.`;
    default:
      return null;
  }
}

// ... (unchanged)

export function deriveTurn(items: readonly TurnItem[], setup: SetupState): Turn {
  if (items.length === 0) {
    const steps = setupSteps(setup);
    const firstOpen = steps.findIndex((s) => !s.done);
    return { kind: "setup", steps, current: (firstOpen === -1 ? steps.length - 1 : firstOpen) + 1 };
  }

  const pending = items.filter((i) => isGateSource(i.status));
  if (pending.length > 0) {
    const openCount = items.filter((i) => isOpen(i.status)).length;
    return {
      kind: "mine",
      count: pending.length,
      detail: mineDetail(pending),
      why: canPropose(openCount) ? null : BLOCKED_WHY,
      next: nextSteps(pending),
    };
  }

  const working = items.filter((i) => i.status === "planning" || i.status === "implementing");
  if (working.length > 0) {
    return {
      kind: "theirs",
      detail: working
        .map((w) => (w.status === "planning" ? `${w.agent} is writing the plan for ${w.key}` : `${w.agent} is implementing ${w.key}`))
        .join(" · "),
      next: nextSteps(working),
    };
  }

  return { kind: "none", detail: NONE_DETAIL };
}
```

After:

```ts
export type TurnItem = {
  key: string; status: string; agent: string; validation: string | null;
  accepted: boolean;                                      // done이고 acceptedAt이 있다
  handoff: { step: string; note: string | null } | null;  // 열린 run의 마지막 원장 행이 handoff — dev가 커밋을 기다린다
};

// ... (unchanged)

// 런북(CLAUDE.runbook.md)의 단계 번호로 말한다 — 세션은 그 문서를 이미 읽고 있다.
export function nextStepLine(item: TurnItem): string | null {
  // 핸드오프가 상태보다 먼저다 — planning/implementing이어도 지금 움직일 사람은 소유자다. note는 dev가 적은 파일 경로(데이터).
  if (item.handoff !== null) {
    return `Commit ${item.handoff.note ?? "the prepared file"} for ${item.key}, then tell the session to continue — ${item.agent} resumes.`;
  }
  switch (item.status) {
    case "planning":
      return `Continue the runbook for ${item.key}: step 3 — ${item.agent} writes the plan.`;
    case "in_review":
      return isPlanUnverified(item.status, item.validation) ? `Continue the runbook for ${item.key}: step 4 — verify the plan.` : null;
    case "implementing":
      return `Continue the runbook for ${item.key}: step 6 — ${item.agent} implements.`;
    case "done":
      return isAwaitingAcceptance(item.status, item.accepted) ? `Continue the runbook for ${item.key}: step 7 — accept.` : null;
    default:
      return null;
  }
}

// ... (unchanged)

export function deriveTurn(items: readonly TurnItem[], setup: SetupState): Turn {
  if (items.length === 0) {
    const steps = setupSteps(setup);
    const firstOpen = steps.findIndex((s) => !s.done);
    return { kind: "setup", steps, current: (firstOpen === -1 ? steps.length - 1 : firstOpen) + 1 };
  }

  // 당신 차례 = 게이트가 열린 것 + 인수를 기다리는 것 + 커밋을 기다리는 것. on_hold는 여전히 배너를 소유하지 않는다.
  const pending = items.filter((i) => isGateSource(i.status) || isAwaitingAcceptance(i.status, i.accepted) || i.handoff !== null);
  if (pending.length > 0) {
    const openCount = items.filter((i) => isOpen(i.status)).length;
    return {
      kind: "mine",
      count: pending.length,
      detail: mineDetail(pending),
      why: canPropose(openCount) ? null : BLOCKED_WHY,
      next: nextSteps(pending),
    };
  }

  const working = items.filter((i) => i.status === "planning" || i.status === "implementing");
  if (working.length > 0) {
    return {
      kind: "theirs",
      detail: working
        .map((w) => (w.status === "planning" ? `${w.agent} is writing the plan for ${w.key}` : `${w.agent} is implementing ${w.key}`))
        .join(" · "),
      next: nextSteps(working),
    };
  }

  return { kind: "none", detail: NONE_DETAIL };
}
```

`mineDetail`에는 두 부류를 더한다 — 인수 대기 "`FEAT-01` is done — accept it" / "{n} items are done — accept them",
핸드오프 "`FEAT-01` is waiting for your commit" / "{n} items are waiting for your commit". 순서는 기존 셋 뒤
(승인 준비 → 검증 필요 → 계획 요청 → 인수 → 커밋). **모든 문구는 product-copy §5에 먼저 적고 승인받은 뒤 코드로 옮긴다**
(§1 "Code is derived from this file"). 위 코드의 문자열은 후보다. `handoff.note`는 에이전트가 쓴 텍스트이므로
`NextStepBox`가 그리는 `CodeBlock`(모노) 안에서만 쓰고 산문에 섞지 않는다.

**B-3. 템플릿(private).** `dev.md` Commit handoff 단락(스텁 영역): "stop without an outcome" →
"send `agent_next` with `outcome: "handoff"` and the prepared file's path as `note`, then stop"; A-4·B-6·hold의
같은 문장도 함께. `CLAUDE.runbook.md` 3단계·규칙 절과 `docs/agents/README.md`의 핸드오프 단락도 같은 말로.
스텁이 바뀌므로 기존 프로젝트는 `/harness:init` 재실행으로 받는다(lock 관리 파일 덮어쓰기). **옛 스텁은 그대로 동작한다** —
outcome 없이 멈추면 서버는 예전처럼 침묵할 뿐 거부하지 않는다.

**B의 대안.** *run 열린 채 마지막 활동 시각을 배너에 표시.* "멈춤 vs 진행"뿐 아니라 "진행 vs 죽음"까지 부분적으로
말해 주지만, 핸드오프를 **명시적 사실**이 아니라 "N분째 조용함"으로 추정하게 된다. 원장 = 감사 로그(불변식 8)의 뜻에는
명시가 맞다. 활동 시각 표시는 이 제안과 독립적인 후속으로 남긴다(Scope 제외).

### C. 검증 기록을 원장에 묶는다 — `plan-verifier`의 `verify` 통과가 마지막 `plan_submit` 뒤에 있어야 한다

`report_submit`의 벽과 같은 뜻이다: "기록 전에 독립 패스를 **시도**했다"를 원장으로 증명한다. 결함 유무의 판정은
지금처럼 메인 루프의 몫이다(verifier의 `verify`가 `ok`인 것은 "모든 경로를 돌렸다"이지 "결함 0"이 아니다 —
`plan-verifier.md:121`). 순서를 재는 이유: 검증 뒤 계획서를 고치고 `plan_submit`을 재호출했으면(런북 4단계) 그
검증은 옛 문서의 것이다.

`src/server/pipeline/board-rules.ts` — `decideValidation`

Before(`:60-64`):

```ts
export function decideValidation(status: string, text: string): Decision<null> {
  if (!canRecordValidation(status)) return { ok: false, reason: `validation only in in_review (now ${status})` };
  const bad = checkText("validation", text);
  return bad ? { ok: false, reason: bad } : { ok: true, value: null };
}
```

After:

```ts
export const PLAN_VERIFIER = "plan-verifier";

export type ValidationInput = {
  status: string;
  text: string;
  // 같은 (project, plan-verifier, key)에 stepId "verify"·outcome "ok" 원장 행이 **마지막 plan_submit 뒤에** 있는가.
  verifierPassedAfterPlan: boolean;
};

// 불변식 8의 벽, report_submit과 대칭. "기록 전에 독립 패스를 시도했다"를 원장으로 증명한다 — 결함 유무의 판정은
// 여전히 메인 루프의 것이다(verify ok = 경로를 다 돌렸다, ≠ 결함 0). Free는 plan-verifier가 플랜 밖이라 자연히
// 거부된다 — Free 런북이 말하는 "no validation record"와 같은 결과다.
export function decideValidation(i: ValidationInput): Decision<null> {
  if (!canRecordValidation(i.status)) return { ok: false, reason: `validation only in in_review (now ${i.status})` };
  const bad = checkText("validation", i.text);
  if (bad) return { ok: false, reason: bad };
  if (!i.verifierPassedAfterPlan) {
    return { ok: false, reason: "no plan-verifier pass recorded after the last plan_submit — dispatch plan-verifier, then record the validation" };
  }
  return { ok: true, value: null };
}
```

보존 불변: 앞의 두 거부(상태·150자)는 문구·순서가 그대로다. 새 거부는 그 뒤에만 온다.

`src/server/pipeline/board.ts` — `recordValidation`

Before(`:166-176`):

```ts
export async function recordValidation(projectId: string, input: { key: string; text: string }, actorRef: string) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const d = decideValidation(row.status, input.text);
    if (!d.ok) return fail(d.reason);
    const item = await tx.boardItem.update({ where: { id: row.id }, data: { validation: input.text } });
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: row.status, actor: "agent", actorId: actorRef, note: "validation" } });
    return { ok: true as const, item };
  });
}
```

After:

```ts
export async function recordValidation(projectId: string, input: { key: string; text: string }, actorRef: string) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    // 벽의 재료: 마지막 plan_submit 시각과, 그 뒤의 plan-verifier verify ok. 조회는 in_review일 때만 한다 — 다른 상태는 첫 검사가 거부한다.
    const lastPlan = row.status === "in_review"
      ? await tx.transitionEvent.findFirst({ where: { boardItemId: row.id, note: "plan" }, orderBy: { at: "desc" }, select: { at: true } })
      : null;
    const verifierPassedAfterPlan =
      row.status === "in_review" &&
      (await tx.agentRunStep.findFirst({
        where: { stepId: "verify", outcome: "ok", ...(lastPlan ? { at: { gt: lastPlan.at } } : {}), run: { projectId, agent: PLAN_VERIFIER, key: input.key } },
        select: { id: true },
      })) !== null;
    const d = decideValidation({ status: row.status, text: input.text, verifierPassedAfterPlan });
    if (!d.ok) return fail(d.reason);
    const item = await tx.boardItem.update({ where: { id: row.id }, data: { validation: input.text } });
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: row.status, actor: "agent", actorId: actorRef, note: "validation" } });
    return { ok: true as const, item };
  });
}
```

`lastPlan`이 없는 `in_review`는 `plan_submit` 선행 규칙상 있을 수 없지만(`requiresPlan`), 있어도 "어느 verify ok든"으로
느슨해질 뿐 잘못 여는 방향이다 — 승인 메모(Approval)에 "통과"로 확정했다.

문서: `protocol.md` `validation_record` 행에 벽을 적고, `product-copy.md` §3 "Validation record" 단락과 §12 사유 표에
새 문구를 더한다. `invariants.md` 「이 저장소가 특히 지키는 것」에 "검증 기록도 verify 원장 뒤에만 받는다" 한 줄.
런북 4단계(private)에 "the server refuses `validation_record` until a plan-verifier pass is on record after the
last `plan_submit`" 한 문장. Free 런북은 이미 맞는 말을 하고 있어 변경 없음.

**C의 대안.** *메인 루프 전용 토큰/행위자 분리.* 누가 썼는지는 알게 되지만 "독립 패스가 있었나"는 여전히 모른다.
문제는 신원이 아니라 증거다. 기각.

### D. 승인 대상은 기록된 커밋이다 — 문서·에이전트·링크를 그에 맞춘다

**결정: 게이트②가 승인하는 것은 `planCommit`이다.** 이유 — 게이트②는 서버 이벤트이고 서버와 웹이 아는 것은
`planCommit`뿐이다; 디스크는 승인 뒤에도 흔적 없이 바뀔 수 있어 불변식 8이 서지 않는다; 런북 4단계가 이미 이 뜻이다.
`dev.md` B-1의 "그 편집이 승인된 것"은 **소유자 편집도 커밋·재제출을 거친다**는 전제로 바뀐다.

**D-1. dev B-1(private):** 파일을 읽은 뒤 `board_get`의 `planCommit`과 대조한다 —
`git diff --quiet <planCommit> -- docs/plans/<KEY>.md` (dev의 Bash는 읽기·검증 허용). 다르면 `blocked`
("plan on disk differs from the approved commit `<sha7>` — the owner edited it after approval; commit and re-submit,
or reopen") → hold. "that edit is what was approved" 문장은 제거한다. `git diff --quiet`는 exit 1로 차이를 말하므로
읽기 전용이다.

**D-2. 런북(private) 4·5단계:** "Gate 2 approves the commit on the card. If you edit the plan after the validation
and before approving, commit it and have the session re-call `plan_submit` — an edit that isn't on record isn't approved."

**D-3. 링크는 커밋을 연다.**

`src/fsd/entities/board-item/model/doc-link.ts` — `blobHref`

Before(`:8-10`):

```ts
export function blobHref(repo: RepoRef, path: string): string {
  return `https://github.com/${repo.owner}/${repo.repo}/blob/${repo.branch}/${path}`;
}
```

After:

```ts
// ref가 있으면 그 커밋을 연다 — 게이트②가 승인하는 것은 planCommit이고, 보고도 자기 커밋이 있다.
// 없을 때만 브랜치 HEAD(계획서가 아직 제출 전인 경우)다.
export function blobHref(repo: RepoRef, path: string, ref: string | null = null): string {
  return `https://github.com/${repo.owner}/${repo.repo}/blob/${ref ?? repo.branch}/${path}`;
}
```

호출부: `inbox-item.ts:77` `planUrl: row.planPath === null ? null : blobHref(repo, row.planPath, row.planCommit)`.
`item-docs.ts` `toItemDocs`는 계획서에 `planCommit`, 보고에 `report.commit`을 넘기고(둘 다 행에 이미 있다 —
`getWithHistory`가 `reports` 전체를 include한다), 라벨은 A-4대로 `acceptedAt`으로 가른다:

Before:

```ts
type ReportRow = { actor: string; path: string };
type DocSource = { planPath: string | null; reports: readonly ReportRow[] };

export function toItemDocs(row: DocSource, repo: RepoRef): ItemDoc[] {
  const docs: ItemDoc[] = [];
  if (row.planPath !== null) {
    docs.push({ label: "Plan", path: row.planPath, href: blobHref(repo, row.planPath) });
  }

  // 한 행위자가 여러 번 보고할 수 있다 — 묶되 버리지 않는다.
  const byActor = new Map<string, ReportRow[]>();
  for (const report of row.reports) {
    const seen = byActor.get(report.actor);
    if (seen === undefined) byActor.set(report.actor, [report]);
    else seen.push(report);
  }
  for (const actor of orderReportActors(new Set(byActor.keys()))) {
    for (const report of byActor.get(actor) ?? []) {
      docs.push({ label: reportDocLabel(actor), path: report.path, href: blobHref(repo, report.path) });
    }
  }
  return docs;
}
```

After:

```ts
type ReportRow = { actor: string; path: string; commit: string; at: Date };
type DocSource = { planPath: string | null; planCommit: string | null; acceptedAt: Date | null; reports: readonly ReportRow[] };

export function toItemDocs(row: DocSource, repo: RepoRef): ItemDoc[] {
  const docs: ItemDoc[] = [];
  if (row.planPath !== null) {
    docs.push({ label: "Plan", path: row.planPath, href: blobHref(repo, row.planPath, row.planCommit) });
  }

  // 한 행위자가 여러 번 보고할 수 있다 — 묶되 버리지 않는다.
  const byActor = new Map<string, ReportRow[]>();
  for (const report of row.reports) {
    const seen = byActor.get(report.actor);
    if (seen === undefined) byActor.set(report.actor, [report]);
    else seen.push(report);
  }
  for (const actor of orderReportActors(new Set(byActor.keys()))) {
    for (const report of byActor.get(actor) ?? []) {
      // main-loop의 보고는 둘이다: in_review의 검증 라운드 기록과 done의 인수 기록. acceptedAt 이후의 것이 인수 기록이다.
      const isAcceptance = row.acceptedAt !== null && report.at.getTime() >= row.acceptedAt.getTime();
      docs.push({ label: reportDocLabel(actor, isAcceptance), path: report.path, href: blobHref(repo, report.path, report.commit) });
    }
  }
  return docs;
}
```

`reportDocLabel(actor, isAcceptance = false)`는 `main-loop && isAcceptance`일 때 "Acceptance record"를 돌려준다
(`doc-link.ts` `REPORT_LABEL` 옆에 상수 하나). `orderReportActors`는 그대로.

`product-copy.md` §6 게이트② 행에 "**Read the plan ↗** opens the recorded commit", §11 라벨 표에 "Acceptance record".
`protocol.md` `plan_submit` 행에 "승인 대상 = 이 커밋. 소유자 편집도 재제출로 기록에 올린다".

**D의 대안.** *디스크 바인딩(B-1이 이긴다).* `planCommit`을 참고값으로 낮추고 런북 문장을 지운다. 기각: 게이트②
이벤트가 무엇을 승인했는지 서버가 말할 수 없게 되고, 카드가 보여 주는 커밋이 뜻을 잃는다. 편의(소유자가 커밋 없이
고쳐도 됨)보다 감사 가능성이 우선이다 — 이 제품이 파는 것이 그것이다(스펙 §2.1).

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `packages/core/transitions.mjs` · `transitions.test.mjs` | update | reopen 규칙 2행. `"nothing leaves done"` 테스트 교체 | low — 규칙 추가, 기존 전이 불변 |
| `plugin/lib/transitions.mjs` | update(sync) | `npm run sync:plugin-lib`. `check`가 드리프트를 잡는다 | none |
| `prisma/schema.prisma` + `prisma/migrations/<ts>_board_item_accepted_at` | update | `acceptedAt DateTime?` nullable additive | low — 기존 행은 null, 읽기 경로는 null 허용 |
| `prisma/migrations/<ts>_board_item_accepted_at_backfill` | add (2026-09-07 승인) | `UPDATE "BoardItem" SET "acceptedAt" = "updatedAt" WHERE status = 'done' AND "acceptedAt" IS NULL` — 열 이전의 `done`은 손으로 인수된 것 | low — 데이터만, 되돌리려면 그 행들의 `acceptedAt`을 null로 |
| `src/server/pipeline/board-rules.ts` · `board-rules.test.mjs` | update | `TransitionPatch.reopens`, `decideValidation` 입력 객체, `decideReportSubmit` 반환값, `RuleKind` | medium — 판정 함수 3개의 시그니처 |
| `src/server/pipeline/board.ts` | update | `transition`(reopen 처리), `recordValidation`(벽), `submitReport`(acceptedAt) | medium — 트랜잭션 안 쓰기 추가 |
| `src/server/agents/next.ts` · `next.test.ts` | update | `OUTCOMES` + handoff 분기 | low — 조기 반환, 다른 경로 불변 |
| `src/server/mcp/tools.ts` | update | `agent_next` 설명 문구. `inputSchema`는 `z.enum(OUTCOMES)`라 자동. 카피 승인으로 `report_submit`·`validation_record` 설명에 한 구절씩 추가 | none |
| `src/fsd/features/review-gate/model/gate-source.ts` · `gate-source.test.ts` | update | `RuleKind`·`DECLARED`에 `reopen` | low — 테스트가 강제 |
| `src/fsd/features/review-gate/model/inbox-item.ts` | update | `planUrl`에 `planCommit` | low |
| `src/fsd/features/review-gate/model/gate-text.ts` | update | Reopen 라벨·토스트(카피 승인 뒤) | low |
| `src/fsd/entities/board-item/model/acceptance.ts` (new) · `index.ts` | add | `isAwaitingAcceptance` | none |
| `src/fsd/entities/board-item/model/doc-link.ts` | update | `blobHref(ref)`, `reportDocLabel(actor, isAcceptance)` | low — 기본 인자로 호환 |
| `src/fsd/entities/board-item/model/journey.ts` · `journey.test.mjs` | update | `accepted` 인자, done 매핑 | low — 렌더하는 화면 없음 |
| `src/fsd/pages/board-item/model/item-docs.ts` · `item-docs.test.ts` · `ui/board-item-page.tsx` · `src/app/(app)/p/[slug]/items/[key]/page.tsx` | update | 커밋 링크·인수 라벨·Reopen 블록·`acceptedAt` 전달 | medium — UI, mock 먼저 |
| `src/fsd/widgets/turn-banner/model/turn.ts` · `turn.test.ts` · `api/turn-data.server.ts` | update | `TurnItem` 확장, 핸드오프·인수 대기 판정, run 조회 | medium — 배너 문구는 카피 승인 뒤 |
| `docs/architecture/protocol.md` · `invariants.md` · `CONTEXT.md` · `docs/conventions/product-copy.md` | update | 상태 표·도구 행·라벨·배너·사유 | low |
| (private) `en/CLAUDE.runbook.md` · `en/CLAUDE.runbook.free.md` · `en/agents/dev.md` · `en/docs/agents/README.md` · `templates.test.mjs` | update + `npm run seed:templates` | 7단계 인수 보고, 핸드오프 outcome, B-1 커밋 대조, 4·5단계 승인 대상 | medium — 스텁이 바뀌어 `/harness:init` 재실행 필요 |

MCP JSON 계약(`tools.ts` `BoardItemView`)은 손대지 않는다 — Prisma 행이 넓어져도 좁은 형에 대입된다(주석의 규칙).
`board_get` 응답에 `acceptedAt`이 실리는 것은 부수 효과이며 해롭지 않다.

## Safety Analysis

- **상태 기계**: 추가만 한다. 기존 11개 규칙은 바이트 동일. `findRule("agent", "done", *)`은 여전히 null —
  에이전트는 `done`을 떠날 수 없다(테스트로 고정).
- **Inbox 불변**: `needsHumanDecision`은 gate·resume kind만 세므로 `reopen`은 결재함에 오르지 않는다.
  `rejectActionsFor(done)`도 빈 배열(bounce는 kind 불일치, hold 규칙 없음, `canDiscard(done)` false). 뱃지 수 불변.
- **verify 벽과 reopen**: `verifyOk`·`hasVerifyStep`은 "같은 (project, agent, key)의 어느 run이든"이라 reopen 뒤
  옛 verify 기록이 셈에 든다. 이것은 오늘의 hold→resume과 같은 의미론이고, dev 템플릿의 그래프가 어차피
  implement → verify → report를 강제한다. 잔여 리스크에 적는다.
- **핸드오프 outcome**: 라우팅 코드 앞에서 조기 반환하므로 ok/failed/blocked 경로는 불변. `steps.ts`가 `on handoff:`를
  거부하므로 템플릿이 분기를 만들 수 없다. 옛 스텁(outcome 없이 멈춤)은 서버가 거부하지 않는다 — 점진 전환 가능.
- **검증 벽**: 거부가 늘어나는 방향이다. 지금 `validation_record`를 쓰는 유일한 경로(런북 4단계)는 이미
  plan-verifier 디스패치를 전제하므로 정상 흐름은 통과한다. Free는 거부되지만 Free 런북이 애초에 기록을 쓰지 않는다.
- **마이그레이션**: nullable 열 추가 + 백필. 백필 없이는 기존 행 전부 null → "인수 대기"로 읽혀, 이미 `done`인 과거 항목
  전부가 배너에 "needs acceptance"로 영원히 올라온다(실측 저장소 `harness-smoke`의 FEAT-01·02·04). 그래서
  `20260907054533_board_item_accepted_at_backfill`이 열 이전의 `done` 행에 `updatedAt`을 인수 시각으로 채운다 —
  런북 7단계대로 손으로 인수됐지만 서버 기록이 없던 항목이다. 이후 `done`은 main-loop의 `report_submit`이 찍는다.
- **링크**: 커밋 링크는 push 전 404 — 브랜치 링크도 마찬가지였다. 나빠지는 경우 없음.

확인한 항목:

- [x] 앱 진입점과 라우팅 경계 — 새 라우트 없음. 항목 상세에 액션 블록만 추가
- [x] 정적 `import` / `export from` — `entities/board-item/index.ts`에 `isAwaitingAcceptance` 추가, `review-gate/index.ts` 불변
- [x] dynamic `import()` 또는 lazy loading — 없음
- [x] barrel export(`index.ts`) 경유 참조 — `turn.ts`는 `@/fsd/entities/board-item`에서 새 술어를 가져온다(FSD 방향 준수: widgets → entities)
- [x] 테스트와 스크립트 참조 — `gate-source.test.ts`·`transitions.test.mjs`·`journey.test.mjs`·`item-docs.test.ts`·`turn.test.ts`·`next.test.ts`·`board-rules.test.mjs` 갱신
- [x] 타입 선언, 전역 선언, ambient module 영향 — `NextOutput` 불변, `Outcome` 유니온 확장(테스트 `Rec` 타입은 `Outcome`을 참조하므로 자동)
- [x] 런타임 side effect 또는 초기화 코드 — 없음
- [x] API, localStorage/sessionStorage, analytics, 외부 SDK 영향 — MCP 응답에 `acceptedAt` 필드 추가(부수), 도구 집합 불변(`tools.test.mjs`)

## Approval

승인 메모:

- 2026-09-07 "전부 승인" — A~D, Phase 1~5. 아래 결정은 Open Questions에 있던 권고안을 그대로 확정한 것이다.
  - A-3: reopen의 백로그 복원은 Free 백로그 10건 상한을 세지 않는다(추가가 아니라 복원).
  - A-4: Reopen은 항목 상세(`/p/<slug>/items/<key>`)에 둔다. Inbox에는 올리지 않는다.
  - A-4 journey: 스테퍼를 렌더하는 코드는 만들지 않고 `currentIndexFor` 매핑만 고친다.
  - C: `in_review`인데 `note:"plan"` 이벤트가 없는 행은 "어느 verify ok든"으로 통과시킨다(거부로 바꾸지 않는다).
  - D: 승인 대상 = 기록된 `planCommit`. 디스크의 계획서가 아니다.
- 웹 문구(배너·Reopen 라벨·토스트)는 코드 전에 `product-copy.md` 갱신안으로 먼저 보여 준다(§1 규칙, 작업 방식).
  → 2026-09-07 카피 덱 승인(`product-copy.md` §3·§5·§6·§11–§14·§16). 함께 확정: `handoff.note`는 통째로 mono
  박스에만 그린다 · §13의 `report_submit`·`validation_record` 설명에 인수 기록·검증 벽 한 구절씩(`tools.ts` 문자열 2개,
  제안 범위 밖 추가) · 핸드오프 터미널 줄은 "Commit <path>, then continue the runbook for <KEY> — dev resumes." 형식.
- 2026-09-07 추가 승인: **`acceptedAt` 백필 마이그레이션**. 열이 생기기 전에 `done`이 된 행은 손으로 인수된 것이라
  `updatedAt`을 인수 시각으로 채운다 — 아니면 Phase 4 배너가 과거 항목 전부를 "needs acceptance"로 올린다.

## Execution Plan

1. **Phase 1 — 순수 규칙** (`packages/core`, `board-rules.ts`): reopen 규칙·`reopens`·`decideValidation` 입력·
   `decideReportSubmit` 반환·`RuleKind`. `npm run sync:plugin-lib`. 테스트 갱신. `board.ts`의 `recordValidation` 호출부(§C)도
   여기서 갱신한다 — 시그니처가 바뀐 채 두면 `tsc`가 깨져 묶음 경계에서 `npm run check`가 빨개진다. 스키마 의존이 없어 Phase 2에서
   떼어 올 수 있다. 검증: `npm test`, `npm run test:web`, `npm run check`.
2. **Phase 2 — 서버 저장**: `schema.prisma` + `npm run db:migrate -- --name board_item_accepted_at`(로컬, `DATABASE_URL` 필요),
   `board.ts` 셋, `next.ts` handoff, `tools.ts` 문구. 검증: `npm run test:web`, `npm run check`.
3. **Phase 3 — 문서·템플릿**: `product-copy.md` 갱신안 먼저(승인 게이트) → `protocol.md`·`invariants.md`·`CONTEXT.md` →
   private 템플릿 4종 + `templates.test.mjs` → `npm run seed:templates`. 백필 마이그레이션도 여기서(승인 뒤 추가). 검증:
   `npm run test:templates`, `npm run test:web`, `npm run check`.
4. **Phase 4 — 웹** (정적 mock → 승인 → 구현): 배너, 항목 상세 Reopen, 커밋 링크·라벨, journey. 검증: `npm run test:web`,
   `npm run check`, Playwright 스크린샷 자체 평가. 실행: mock 렌더 자평에서 나온 결정 셋(버튼 목적지 · Accepted 시각 · 핸드오프 줄)을
   카피에 먼저 적고 코드로 옮겼다 — 실행 메모 참조.
5. **Phase 5 — 사이클 회귀 실측** (2026-09-06 보고서와 같은 형식): 핸드오프 → 배너 "Waiting on you" · verifier 전
   `validation_record` 거부 → verifier 뒤 통과 · 인수 보고 → `acceptedAt` · Reopen → 백로그 복원. `docs/test-reports/active/`에 기록.

Phase 1·2는 A~D를 모두 담고 있어 승인 범위가 A만이면 C·D의 해당 변경(검증 벽, 링크)을 빼고 진행한다 — 서로 독립이다.

## Verification Plan

실행할 검증:

```bash
npm test                      # packages/core · plugin/bin — transitions reopen
npm run test:web              # board-rules · next · turn · gate-source · journey · item-docs
npm run check                 # plugin/lib 드리프트 · lint · FSD 경계 · 타입 · 아키텍처 테스트
npm run test:templates        # private 템플릿 단계 그래프(재시드 전)
npm run seed:templates        # 로컬, 템플릿 변경 뒤
```

추가 테스트(형제 테스트를 미러링한 것 — 성공 기준의 일부):

`packages/core/transitions.test.mjs` — `"nothing leaves done; unknown statuses rejected"`를 교체:

```js
  it("done leaves only by a human reopen with a reason; agents never leave done", () => {
    const back = findRule("human", "done", "implementing");
    assert.equal(back.kind, "reopen"); assert.equal(back.requiresResult, true); assert.equal(back.clearsValidation, undefined);
    const replan = findRule("human", "done", "planning");
    assert.equal(replan.kind, "reopen"); assert.equal(replan.requiresResult, true); assert.equal(replan.clearsValidation, true);
    for (const s of ["proposed", "in_review", "done", "on_hold"]) assert.equal(findRule("human", "done", s), null, s);
    for (const s of STATUSES) assert.equal(findRule("agent", "done", s), null, s);
    assert.equal(isOpen("done"), false);
    assert.equal(findRule("human", "__proto__", "planning"), null);
    assert.equal(findRule("agent", "planning", "toString"), null);
    assert.equal(findRule("human", "승인대기", "planning"), null); // 옛 한글 식별자는 더 이상 상태가 아니다
  });
```

`src/server/pipeline/board-rules.test.mjs`:

```js
  it("reopen: human only, needs a result, sets reopens; planning also clears validation", () => {
    const r = row({ status: "done", validation: "clean pass", results: ["shipped"] });
    assert.equal(decideTransition(r, "agent", "implementing", "x").ok, false);
    assert.match(decideTransition(r, "human", "implementing", undefined).reason, /empty/);
    const back = decideTransition(r, "human", "implementing", "acceptance check 3 failed");
    assert.equal(back.ok, true); assert.equal(back.value.reopens, true); assert.equal(back.value.completes, false);
    assert.equal(back.value.validation, "clean pass"); assert.deepEqual(back.value.results, ["shipped", "acceptance check 3 failed"]);
    assert.equal(decideTransition(r, "human", "planning", "plan was wrong").value.validation, null);
    assert.equal(decideTransition(row({ status: "in_review" }), "human", "on_hold", "x").value.reopens, false); // hold는 사람 규칙이지만 reopen이 아니다
  });
  it("validation needs a plan-verifier pass after the last plan_submit", () => {
    const v = (o = {}) => decideValidation({ status: "in_review", text: "clean pass", verifierPassedAfterPlan: true, ...o });
    assert.equal(v().ok, true);
    assert.match(v({ verifierPassedAfterPlan: false }).reason, /plan-verifier/);
    assert.match(v({ status: "implementing" }).reason, /only in in_review/); // 상태 검사가 먼저다
    assert.match(v({ text: "x".repeat(151) }).reason, /150/);
  });
  it("report_submit marks acceptance only for main-loop in done", () => {
    assert.equal(decideReportSubmit(rs({ actor: "main-loop" })).value.accepts, true);
    assert.equal(decideReportSubmit(rs({ actor: "web-dev" })).value.accepts, false);
    assert.equal(decideReportSubmit(rs({ status: "in_review", actor: "main-loop" })).value.accepts, false);
  });
```

`src/server/agents/next.test.ts` — 기존 `harness`를 그대로 쓴다:

```ts
describe("agentNext — handoff", () => {
  it("records the pause, stays on the step, and the next outcome-less call resumes the same step", async () => {
    const h = harness({ board: { "FEAT-1": "planning" } });
    await h.call(dev());
    step(await h.call(dev({ outcome: "ok" })));                                   // start → plan
    const paused = step(await h.call(dev({ outcome: "handoff", note: "docs/plans/FEAT-1.md" })));
    assert.equal(paused.step, "plan");
    assert.match(paused.instruction, /^\(handoff recorded/);
    assert.deepEqual(h.records.at(-1), { runId: "run1", stepId: "plan", outcome: "handoff", note: "docs/plans/FEAT-1.md" });
    assert.equal(h.runs[0].stepId, "plan");
    assert.equal(h.runs[0].refused, 0);                                            // 거부가 아니다
    const resumed = step(await h.call(dev()));
    assert.equal(resumed.step, "plan");
    assert.equal(resumed.instruction, "Plan it as web-dev.");
  });
});
```

`src/fsd/widgets/turn-banner/model/turn.test.ts` — `item()` 헬퍼에 `accepted: false, handoff: null` 기본값을 더한 뒤:

```ts
describe("deriveTurn — handoff and acceptance", () => {
  it("a handoff is yours even while the item is planning, with the commit line first", () => {
    const paused = { ...item("FEAT-01", "planning", null, "web-dev"), handoff: { step: "plan", note: "docs/plans/FEAT-01.md" } };
    const turn = deriveTurn([paused], ready);
    if (turn.kind !== "mine") assert.fail(turn.kind);
    assert.equal(turn.count, 1);
    assert.deepEqual(turn.next, [{ key: "FEAT-01", line: "Commit docs/plans/FEAT-01.md for FEAT-01, then tell the session to continue — web-dev resumes." }]);
  });
  it("done without an acceptance record is yours; accepted done owns nothing", () => {
    if (deriveTurn([item("FEAT-02", "done")], ready).kind !== "mine") assert.fail("unaccepted done");
    assert.equal(deriveTurn([{ ...item("FEAT-02", "done"), accepted: true }], ready).kind, "none");
    assert.equal(nextStepLine(item("FEAT-02", "done")), "Continue the runbook for FEAT-02: step 7 — accept.");
  });
});
```

(위 문자열은 product-copy §5 승인 뒤 확정 — 승인된 문구로 테스트를 맞춘다.)

`src/fsd/pages/board-item/model/item-docs.test.ts` — 첫 테스트의 입력에 `planCommit: "b72a941", acceptedAt: null`과 보고별 `commit`·`at`을 더하고 `href` 단언을 커밋 링크로 바꾼 뒤, 인수 라벨 테스트를 더한다:

```ts
    assert.equal(docs[0]?.href, "https://github.com/Sangeok/harness-smoke/blob/b72a941/docs/plans/FEAT-02.md"); // planCommit
  it("labels the main-loop report after acceptedAt as the acceptance record", () => {
    const at = (iso: string) => new Date(iso);
    const docs = toItemDocs(
      { planPath: null, planCommit: null, acceptedAt: at("2026-09-06T15:10:00Z"), reports: [
        { actor: "main-loop", path: "docs/agents/main-loop/FEAT-04.md", commit: "e148d97", at: at("2026-09-06T14:50:00Z") },
        { actor: "main-loop", path: "docs/agents/main-loop/FEAT-04.md", commit: "4cb9012", at: at("2026-09-06T15:10:00Z") },
      ] },
      repo,
    );
    assert.deepEqual(docs.map((d) => d.label), ["Validation record", "Acceptance record"]);
  });
```

검증 기준:

- 위 명령 전부 exit 0. 기존 실패는 없고 기존 lint 경고 1건만 있다(기준 `a9b4bf2`: `npm run check` exit 0 · `npm test` 123/123 · `npm run test:web` 157/157 —
  이전 제안서 `2026-09-06-scripts-tooling-cleanup.md`의 verification-summary).
- 신규 실패는 위 새 테스트와, 시그니처 변경(`decideValidation`·`decideReportSubmit`·`toItemDocs`·`TurnItem`)을 따라가지
  못한 호출부의 타입 오류로만 나타나야 한다. 그 외 실패는 회귀다.
- Phase 5 실측: 회귀 보고서 형식으로 4항목(핸드오프 배너·검증 벽 거부/통과·인수 표시·Reopen 복원) `PASS`.

## Verification Results

아직 실행 전이면 `Not run yet`으로 둔다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm test` | Phase 1 (2026-09-07): 123/123 pass · Phase 2: 123/123 · dev 머지 후: 112/112 | transitions reopen 테스트 포함 |
| `npm run test:web` | Phase 1 (2026-09-07): 159/159 pass (기준 157 + 신규 3 − 교체 1) · Phase 2: 160/160 (next handoff 1건 추가) · Phase 4: 170/170 (journey done 2건 · reopenTargetsFor · inbox planUrl · item-docs 3건 · turn 4건, 기존 2건 갱신) · dev 머지 후: 153/153 | board-rules 신규 3건(reopen · validation 벽 · accepts) · gate-source DECLARED · next handoff. turn · journey · item-docs는 Phase 4에서 |
| `npm run check` | Phase 1 (2026-09-07): exit 0, 기존 lint 경고 1건(`planForUser` unused)만 · Phase 2: exit 0, 같은 경고 1건 · Phase 3: exit 0, 같은 경고 1건 · Phase 4: exit 0, 같은 경고 1건 | plugin/lib in sync |
| `npm run test:templates` | Phase 3 (2026-09-07): 16/16 pass — 핸드오프 테스트 3건이 outcome `handoff` 계약으로 바뀜, dev 스텁 108줄(상한 110) | 재시드 전 실행 |
| `npm run db:migrate` (backfill) | Phase 3 (2026-09-07): `20260907054533_board_item_accepted_at_backfill` 적용됨 | 로컬 `.env`의 Neon DB |
| `npm run seed:templates` | Phase 3 (2026-09-07): 실행됨 — 결과는 아래 실행 메모 | 템플릿 4종 변경 뒤 |
| `npm run db:migrate -- --name board_item_accepted_at` | Phase 2 (2026-09-07): 적용됨 — `prisma/migrations/20260907050756_board_item_accepted_at/migration.sql` (`ALTER TABLE "BoardItem" ADD COLUMN "acceptedAt" TIMESTAMP(3)`) | 로컬 `.env`의 `DATABASE_URL`(Neon)에 적용. 비대화형 셸에서도 동작했다 |

Phase 5 실행 메모(2026-09-07): 에이전트 대신 사람이 MCP 도구를 직접 불러(JSON-RPC over HTTP) 한 사이클을 돌렸다 — 서버 규칙·원장·웹은
실제이고 템플릿 지시 준수는 확인 밖이다(보고서 follow-up). 네 항목 전부 PASS. 잡은 것 둘: 승인된 카피 §6의 도움말 문장이 `inbox-card.tsx`에
옮겨지지 않았던 것(F-A), Inbox 탭에서 인수·핸드오프뿐인 차례가 "Waiting on you" 아래에 "Nothing to decide."만 남기던 것(F-B — 카드가 없는
차례는 디테일 줄과 항목 버튼을 유지하도록 `turn-banner.tsx` 수정, 카피 §5 한 줄). dev 서버는 옛 Prisma 클라이언트를 물고 있어 재시작이
필요했다 — 배포 절차에 "migrate → generate → 재시작"을 둘 것.

dev 머지 메모(2026-09-07): PR #19(dead-code 제거)를 머지하며 A-4를 폐기했다. #19가 `journey.ts`·`journey.test.mjs`를
지웠고(81d6858 "아무도 부르지 않는 여정 스테퍼를 걷어낸다"), 이 제안서 스스로 스테퍼를 렌더하지 않는다고 적었으므로(위 A-4)
소비자 없는 코드의 매핑을 갱신하는 셈이었다 — 삭제를 받아들였다. `isAwaitingAcceptance`는 `acceptance.ts`에 남는다:
`turn.ts`가 배럴로 쓴다. 배럴 3종은 #19의 "실제 소비자만 공개한다"를 병합 후 상태에 다시 적용해
`ReopenActions`·`isAwaitingAcceptance`만 남기고 `needsHumanDecision`·`toInboxItems`·`TransitionInput`·`deriveTurn`·
`nextStepLine`·`HEADLINE`을 닫았다(모두 슬라이스 안에서 상대경로로만 쓰인다). `board-rules.ts`의 `RuleKind`는 export를
닫되 `"reopen"`은 유지했다. 위 검증표의 감소분(test:web 170→153, test 123→112)은 #19가 지운 테스트 때문이지 회귀가 아니다.

Phase 4 실행 메모(2026-09-07): 정적 mock을 먼저 그려 승인받았다(아티팩트 "Stagekeeper Phase 4 Mock"). mock을 렌더해 보고 셋을
바꿨다 — (1) 인수·핸드오프만 있는 차례에는 "Open inbox" 대신 그 항목 페이지로 가는 "Open <KEY>"(Inbox가 비어 "Nothing to decide."로
가지 않게; `TurnTarget`) (2) 항목 상세 헤더에 "Accepted <시각>" (3) 핸드오프 터미널 줄에서 "— dev resumes" 꼬리 제거(박스 폭 초과).
Reopen 블록은 주 버튼 + 링크 → 누르면 노트 칸 + 확인 버튼 + Cancel로 바뀌는 형(같은 라벨 버튼 둘 방지). 셋 다 `product-copy.md`에 먼저 적었다.
journey는 `deriveJourney(status, validation, accepted)`로 done을 이분한다 — 렌더하는 화면은 여전히 없다.
실제 화면 대조는 dev 서버가 옛 Prisma 클라이언트(acceptedAt 이전)를 물고 있어 재시작 뒤에 한다.

Phase 3 실행 메모(2026-09-07): 카피 덱을 `product-copy.md`에 먼저 적어 승인받고 코드·문서·템플릿을 그에 맞췄다. `protocol.md`에
「게이트②가 승인하는 것」·「커밋 핸드오프」 절과 인수 기록 단락을 더했고, `invariants.md` 「이 저장소가 특히 지키는 것」에 두 줄,
`CONTEXT.md` `done` 행을 고쳤다. private 템플릿은 stub 줄 예산(110) 때문에 dev.md의 핸드오프 문단 둘을 하나로 합쳤다.

Phase 2 실행 메모(2026-09-07): `migrate dev` 뒤에도 `tsc`가 `acceptedAt`을 몰랐다(`board.ts` 두 곳 TS2353). `npm run db:generate`를 따로 돌리자 통과 —
Phase 5 실측 전 배포·체크아웃 절차에 "migrate 뒤 generate"를 넣어야 한다. `src/generated/prisma`는 git 밖이라 diff에는 보이지 않는다.

Phase 1 실행 메모(2026-09-07): 제안서의 grounded test 한 줄이 틀려 있었다 — `decideTransition(row({ status: "implementing" }), "human", "on_hold", "x")`는
사람 규칙이 없어 `value`가 undefined다. `in_review`로 고쳤다(위 Verification Plan과 실제 테스트 파일 모두). 코드 쪽 결함은 아니다.
| 사이클 회귀 실측 | Phase 5 (2026-09-07): PASS — 인수·핸드오프·검증 벽·Reopen 4항목 + 부수 6항목 | `docs/test-reports/completed/2026-09-07-human-checkpoint-cycle-regression.md`. 실행 중 결함 2건(F-A 카드 도움말 문장 누락, F-B Inbox 탭 배너) 발견·수정 |

## Risks and Rollback

잔여 리스크:

- **기존 `done` 항목이 일제히 "인수 대기"로 뜬다**(`acceptedAt` null). 실측 프로젝트 한둘의 문제이고, 인수 보고를
  사후 제출하면 사라진다. 서비스 사용자가 생기기 전이라 데이터 백필은 하지 않는다.
- **reopen 뒤 옛 verify 기록이 벽을 통과시킨다** — hold→resume과 같은 기존 의미론. dev 그래프가 verify를 강제하므로
  실질 위험은 낮다. 엄격하게 하려면 `verifyOk`·`hasVerifyStep`을 "마지막 reopen/resume 이후"로 좁히는 후속이 필요하다.
- **스텁 변경**: 핸드오프 문장이 스텁 영역에 있어 기존 프로젝트는 `/harness:init` 재실행 전까지 옛 방식(outcome 없이
  멈춤)으로 동작한다. 서버는 둘 다 받으므로 깨지지 않지만 배너 혜택은 재실행 뒤에만 있다.
- **검증 벽이 Pro/Max의 "메인 루프만으로 검증" 습관을 막는다.** 그 습관은 런북이 이미 금지하는 것이다(4단계) — 의도된 강제.
- **핸드오프 note가 화면에 오른다**(파일 경로). `CodeBlock` 안에만 두고 산문에 섞지 않는다. 150자 상한은 `NOTE_MAX`(500)보다
  짧지 않으므로 긴 note는 잘라 보여 줄지 Open Questions.
- **"진행 중 vs 죽음"은 여전히 구분 못 한다** — Scope 제외, 별도 후속.

롤백 방법:

- Phase 1·2: 커밋 되돌리기. 마이그레이션은 nullable 열이라 되돌리지 않고 두어도 무해하다(원하면 `prisma migrate` 역마이그레이션 1건).
- Phase 3: private 템플릿을 이전 커밋으로 되돌리고 `npm run seed:templates`. 사용자 저장소의 스텁은 `/harness:init` 재실행.
- Phase 4: 커밋 되돌리기. 데이터 영향 없음.

## Completion or Closure Notes

완료 또는 닫힘 처리 후 `completed/`로 이동할 때 작성합니다.

완료 기록(`status: "completed"`일 때 작성):

- completed-at: front matter 참조
- verification-summary: front matter 참조
- implementation PR/commit: PR #20(`harness/human-checkpoint-consistency` → `dev`). 커밋 `c253dbb`(Phase 1·2) · `0322308`(Phase 3) ·
  `06bead4`(Phase 4) · `3eccc7f`(dev 머지) · `aa683a2`(머지 메모) · Phase 5 수정 2건은 이 문서 이동과 같은 커밋. private 템플릿
  `Sangeok/harness-templates@59b6ffd`.
- changed files summary: 순수 규칙(`transitions.mjs`·`board-rules.ts`·`gate-source.ts`), 서버(`board.ts`·`next.ts`·`tools.ts`·스키마
  `acceptedAt` + 백필 마이그레이션), 문서(`protocol.md`·`invariants.md`·`CONTEXT.md`·`product-copy.md`), 템플릿 4종, 웹(배너 모델·
  로더·UI, Reopen 액션, 항목 상세, 문서 링크·라벨, 인수 술어).
- remaining follow-up: 에이전트 실행으로 템플릿 지시(handoff outcome · 7단계 인수 보고 · B-1 planCommit 대조) 준수 확인 — 다음 템플릿
  변경 사이클에서. 기존 프로젝트는 `/harness:init` 재실행으로 새 스텁을 받는다. `AUTH_SECRET` 교체 권고(실측 중 쿠키 노출).

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
- [x] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다. (승인 기록 유지, stage는 완료로 null)
- [x] `proposal-size`는 `small` 또는 `standard`만 사용했고, standard 강제 조건에 해당하는 작업을 small로 낮추지 않았다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 승인 조건과 참고 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다.
- [x] 잔여 리스크를 명시했다. 없으면 "없음"이라고 적었다.
- [x] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다.
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다. (해당 없음)
