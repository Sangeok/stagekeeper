---
status: "completed"
stage: null
proposal-size: "small"
created-at: "2026-09-05"
approved-by: "Sangeok"
approved-at: "2026-09-05"
approval-scope: "대화 승인(\"run 개방 라우팅 수행\") — 라우팅·소유 검사·dev start 제거 전부"
completed-at: "2026-09-05"
verification-summary: "npm test 86/86 · test:web 156/156 · check pass · test:templates 9/9. dev는 6단계 7호출에서 5단계 6호출이 됐고, 파견당 왕복 1회(사이클당 2회, 약 126,000 토큰)가 준다. 스텁은 바이트 동일해 사용자 저장소는 영향이 없다."
closed-at: null
closed-by: null
closed-reason: null
owners: ["Sangeok"]
related:
  - "docs/investigations/completed/2026-09-04-agent-next-round-trip-cost.md"
  - "docs/proposals/completed/2026-09-04-harness-platform-phase-4-entitlement.md"
  - "docs/architecture/protocol.md"
---

# `agent_next` — run을 여는 자리에서 라우팅한다

## Summary

새 run은 언제나 템플릿의 **첫 단계**로 열린다. 그래서 dev 템플릿은 보드 상태를 읽고
`plan`이냐 `implement`냐를 고르는 `start` 단계를 따로 둬야 했다. 서버가 이미 `requires`로
같은 판정을 하므로, **run을 열 때 `requires`가 맞는 첫 단계로 열면** 그 라우터 단계가 통째로
사라진다. dev는 사이클당 두 번 파견되므로 왕복 2회, 약 126,000 토큰이 준다.

라우터를 지우면 그 안에 있던 **항목 소유 검사**도 같이 사라진다. 그래서 이 제안은 그 검사를
서버로 옮기는 것을 함께 담는다 — 선택이 아니라 라우팅 변경의 비용이다.

## Goal

- `agent_next`의 run 개방을 "첫 단계"에서 "**열리는 첫 단계**"로 바꾼다.
- dev 템플릿에서 `start` 라우터 단계를 없앤다(왕복 2회 절감).
- 라우터가 하던 항목 소유 검사를 서버 판정으로 옮긴다(제안서 Phase 4가 남긴 알려진 한계를 닫는다).

## Proposal Size

`small`. 서버 판정 한 곳(`next.ts`)과 private 템플릿 한 파일, 그리고 프로토콜 문서다.
새 모델도, 새 도구도, 화면 변경도 없다.

## Current State

`src/server/agents/next.ts`의 run 개방:

```ts
const run = await deps.openRun(projectId, agent, key);
if (!run) {
  if (input.outcome) return ok({ done: true });
  const first = parsed.steps[0];          // ← 언제나 0번
  await deps.createRun(scope, agent, key, first.id);
  return serve(first);
}
```

`requires` 판정(`Facts`)은 **전진할 때만** 쓰인다. 개방에는 쓰이지 않는다.

그래서 dev 템플릿은 `## step:start`에서 `board_get`으로 상태를 읽고
`next: implement | plan`으로 스스로 갈라진다. 그 단계는 실제 작업을 하나도 하지 않으면서
왕복 하나(약 63,000 토큰, G1 실측)를 쓴다. 같은 단계가 소유 검사도 겸한다 —
"**Check `agent` is `{{ws.agent}}`** — another agent's item isn't yours".

서버에는 소유 검사가 없다. Phase 4 제안서가 **알려진 한계**로 적어 둔 자리다:
"항목 소유 검사 없음 — 다른 dev의 key로 run을 열어도 서버가 막지 않는다."

## Scope

포함:

- `next.ts`의 run 개방 라우팅과 소유 검사
- `NextDeps`에 소유 조회 하나 추가(`itemAgent`)
- private 템플릿 `en/agents/dev.md`의 `start` 제거
- `docs/architecture/protocol.md`의 `agent_next` 행

제외:

- 다른 에이전트의 `start`(pm·plan-verifier·doc-auditor·feature-scout) — 이미 `requires`가 없어
  개방 동작이 그대로다. 손대지 않는다
- 단계 병합 일반 — F1 조사가 "나머지는 구조적"이라고 결론지었다
- 화면·플랜·상한 일체

## Proposal

**① 열리는 첫 단계로 연다.** run이 없을 때 `parsed.steps`를 순서대로 훑어 `requires`가
전부 맞는 첫 단계에서 run을 연다. 하나도 맞지 않으면 지금의 전진 거부와 **같은 문구**로
거부한다(`not open: step X opens when …`) — 열린 단계가 없다는 사실을 같은 어휘로 말한다.

순서 훑기는 현재 동작의 일반화다. 첫 단계에 `requires`가 없는 템플릿(pm·plan-verifier·
doc-auditor·feature-scout)은 지금과 **완전히 같게** 동작한다.

**② 소유 검사를 서버로.** `key`가 있는 호출에서, 그 항목의 보드 행 `agent`가 부르는
`agent`와 다르면 거부한다. 라우터 단계가 사라져도 검사는 남고, 오히려 프롬프트가 아니라
서버가 강제하므로 더 세다(불변식 4와 같은 방향).

**③ dev의 `start` 제거.** 라우팅과 소유 검사를 서버가 하므로 그 단계가 할 일이 없다.
본문의 상태표는 "내가 어느 단계인지 스스로 판단하라"는 안내였으므로 함께 사라진다 —
서버가 이미 맞는 단계를 준다.

## Affected Files

| 경로 | 변경 |
| --- | --- |
| `src/server/agents/next.ts` | run 개방 라우팅, 소유 검사, `NextDeps.itemAgent` |
| `src/server/agents/runs.ts` | `itemAgent` 구현(Prisma) |
| `src/server/agents/next.test.ts` | 개방 라우팅 3건·소유 3건 테스트 |
| `docs/architecture/protocol.md` | `agent_next` 행에 개방 라우팅과 소유 거부 |
| (private) `en/agents/dev.md` | `## step:start` 제거 |
| (private) `templates.test.mjs` | dev 기대 단계 그래프 |

## Safety Analysis

- **라우팅**: 첫 단계에 `requires`가 없는 템플릿은 동작이 바뀌지 않는다(현재 전부 그렇다,
  dev 제외). dev만 바뀌고, 바뀌는 방향은 "지금 열리는 단계로 바로 간다"이다.
- **열린 단계가 없을 때**: 새 run을 **만들지 않는다**. 거부만 하고 커서를 남기지 않아야
  다음 호출이 깨끗하게 다시 판정한다.
- **소유 검사**: 거부가 늘어나는 방향이라 안전하다. 다만 `main-loop`처럼 key를 쓰지만
  보드 행의 `agent`가 아닌 호출자가 있는지 확인해야 한다 — `agent_next`는 서브에이전트
  전용이고 `main-loop`은 이 도구를 쓰지 않는다(런북 확인 필요, 아래 Verification).
- **되돌리기**: 서버 변경은 커밋 되돌리기로 끝난다. 템플릿은 private 저장소에서
  `start`를 되살리면 된다 — 스텁이 바뀌지 않으므로 사용자 저장소는 손대지 않는다.

## Approval

2026-09-05 대화 승인("run 개방 라우팅 수행"). 범위는 라우팅·소유 검사·dev `start` 제거 전부다.
소유 검사는 선택이 아니라 라우터 제거의 비용이라는 점을 Summary에 적어 함께 승인받았다.

## Execution Plan

1. `next.ts` 개방 라우팅 + 테스트(순수 판정에 가깝게 `NextDeps`를 가짜로 채운다)
2. 소유 검사 + `itemAgent` dep + 테스트
3. private 템플릿에서 dev `start` 제거, 템플릿 테스트 갱신, DB 재시드
4. `protocol.md` 갱신
5. `npm test` · `npm run test:web` · `npm run check` · `npm run test:templates`

## Verification Plan

| 확인 | 방법 | 통과 기준 |
| --- | --- | --- |
| 기존 템플릿 무변화 | pm·plan-verifier·doc-auditor·feature-scout로 run 개방 | 지금과 같은 단계가 나온다 |
| dev 라우팅 | 항목이 `planning`일 때와 `implementing`일 때 각각 새 run 개방 | 각각 `plan`·`implement`가 나온다 |
| 열린 단계 없음 | 항목이 `proposed`일 때 dev run 개방 | 거부, run 생성 없음 |
| 소유 거부 | 다른 dev의 key로 호출 | 거부, 사유에 소유자 |
| `main-loop` 회귀 | 런북 확인 + `next.ts`의 에이전트 허용 검사 | **쓰지 않음**. `main-loop`은 `REPORT_AGENTS`에도 roster에도 없어 `agent_next`가 이미 `unknown agent`로 거부한다 — 소유 검사가 새로 막을 호출자가 없다(구현 전 확인) |
| 왕복 절감 | dev 단계 수 확인 | **6단계 → 5단계, 호출 7회 → 6회**(파견당 1회, 사이클 2회 파견이므로 2회 절감). 계획서의 "5→4"는 `hold`를 빼고 센 것이라 정정한다 |

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm test` | 86/86 pass (2026-09-05) | |
| `npm run test:web` | 157/157 pass (2026-09-05) | next.test.ts 개방 라우팅 3건 · 소유 4건(plan-verifier 회귀 포함) |
| `npm run check` | pass (2026-09-05) | lint · tsc · architecture · plugin/lib in sync |
| `npm run test:templates` | 9/9 pass (2026-09-05) | dev 기대 그래프에서 start 제거 |

## Risks and Rollback

- **가장 큰 위험은 소유 검사가 정당한 호출을 막는 것이다.** 그래서 Verification에
  `main-loop` 확인을 넣었다. 막히면 검사 범위를 좁히거나(예: roster의 dev에만) 되돌린다.
- 라우팅이 예상 밖 단계를 열 위험은 낮다 — 순서대로 훑고 `requires`가 판정하므로,
  잘못 열리려면 템플릿의 `requires`가 이미 틀려 있어야 한다.
- 되돌리기는 서버 커밋 revert + 템플릿 `start` 복원. 사용자 저장소 영향 없음(스텁 불변).

## Completion or Closure Notes

- completed-at: 2026-09-05
- verification-summary: npm test 86/86 · test:web 156/156 · check pass · test:templates 9/9. dev는 6단계 7호출에서 5단계 6호출이 됐고, 파견당 왕복 1회(사이클당 2회, 약 126,000 토큰)가 준다. 스텁은 바이트 동일해 사용자 저장소는 영향이 없다.
- implementation: 브랜치 `harness/agent-next-open-routing`. private 템플릿은 별도 저장소
  (`Sangeok/harness-templates`)에 따로 커밋했다.
- **소유 검사를 처음엔 너무 넓게 걸었다 — `plan-verifier`를 막았다.** `key`가 있는 **모든** 호출에
  걸었는데, `plan-verifier`는 단계가 `requires: in_review`라 key가 필수이면서 항목의 소유자는 아니다
  (소유자는 언제나 워크스페이스 dev). G1 원장의 `run plan-verifier/FEAT-03`이 그 증거다. 안전성 분석에
  "key를 쓰지만 보드 행의 agent가 아닌 호출자"를 위험으로 적어 두고 `main-loop`만 확인하다 놓쳤다.
  회귀 테스트로 재현한 뒤 검사를 **roster의 워크스페이스 에이전트에만** 걸도록 좁혔다 — 소유는
  "누가 이 일을 하느냐"이지 "누가 볼 수 있느냐"가 아니다.
- **설계에 없던 것 하나를 테스트가 잡았다 — 실패 분기 전용 단계.** 순서대로 훑기만 하면 `hold`처럼
  `requires`가 없고 `on failed:`·`on blocked:`로만 닿는 단계가 **어떤 보드 상태에서도 열리는 만능
  입구**가 된다. 실제로 항목이 `proposed`인데 `hold`로 run이 열렸다. 세션을 실패 분기에서 시작할
  수는 없으므로, 진입 후보에서 `next:`로는 닿지 않고 실패 경로로만 닿는 단계를 뺐다(`entrySteps`).
  `next:`로도 닿으면 정상 경로의 일부이므로 남는다(pm의 `report`가 그렇다).
- 템플릿 규약 둘을 갱신했다. "진입 단계는 언제나 `start`"는 이제 `start`를 **두는** 에이전트에만
  적용되고(dev는 라우팅이 대신한다), dev의 분기 단언은 `start` 부재와 `implement.requires` 단언으로
  바뀌었다 — 갈림의 근거가 템플릿에서 서버로 옮겨 갔다는 사실을 테스트가 말하게 했다.
- remaining follow-up:
  - 절감치는 측정된 왕복 단가(약 63,000 토큰)에서 나온 **추정**이다. 실측하려면 G1급 실행이 필요해 하지 않았다.
  - dev `start`가 담던 상태표(어느 상태에서 무엇을 하는가)는 사라졌다. `plan`·`implement` 각
    단계가 자기 몫을 이미 말하므로 그대로 두었으나, 실사용에서 방향을 잃는 신호가 보이면 각 단계 머리에 한 줄씩 되살린다.

## Review Checklist

- [x] Summary·Goal·Scope가 실제 변경 범위와 일치한다.
- [x] Affected Files에 private 저장소 파일을 따로 표시했다.
- [x] Safety Analysis에 되돌리기와 사용자 저장소 영향을 적었다.
- [x] 승인 metadata를 채웠다.
- [x] Verification Results를 실제 실행 결과로 갱신했다.
- [x] 완료 시 `completed/`로 옮기며 `completed-at`·`verification-summary`를 갱신했다.
