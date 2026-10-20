---
status: "pending"
stage: "awaiting-approval"
proposal-size: "standard"
created-at: "2026-10-20"
approved-by: null
approved-at: null
approval-scope: null
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: ["HamSangEok"]
related:
  - "docs/proposals/completed/2026-10-03-local-watch-executor.md"
  - "docs/test-reports/active/2026-10-02-local-watch-executor.md"
  - "docs/proposals/completed/2026-10-20-open-decision-hold.md"
  - "docs/proposals/active/codex-dual-client-runtime-follow-ups.md"
---

# 실행기 상태 표시(Phase A)와 창 없는 상주 실행기(Phase B)

## Summary

지금 사용자는 실행기가 돌고 있는지 알 수 없다. 서버는 실행기의 존재를 모르고, 웹 배너는 실행 여부와 상관없이 늘 같은 안내문을 보인다. 1단계 설계는 이를 "서버의 watch 생존 표시는 제공하지 않으며 … heartbeat는 후속 설계다"로 미뤄 두었다(`docs/proposals/completed/2026-10-03-local-watch-executor.md:1094-1095`). 창 없이 도는 2단계 상주 실행기를 만들기 전에 이 공백부터 메운다.

- **Phase A(표시).** 실행기가 서버에 상태를 보고하고, 프로젝트당 하나의 lease를 잡는다. 웹 배너는 모든 탭에서 실제 상태를 보이고, 배너 옆 스위치로 새 실행을 멈출 수 있다. 1단계 `/harness:watch`도 같은 보고에 참여한다.
- **Phase B(상주).** Pro 이상에서 Claude Code 창 없이 `claude -p`를 띄우는 상주 실행기를 더한다.

결정 18개는 2026-10-20 grill-me에서 사용자가 확정했다. 이 문서는 그 결정을 코드 경계에 놓고, 검증 방법을 정한다. 승인은 한 번, 구현과 출시는 A → B 순서로 두 번 한다.

## Goal

- 사용자가 웹의 어느 탭에서든 실행기가 어디서 돌고, 지금 무엇을 하고, 왜 멈췄는지 안다.
- 같은 프로젝트에서 실행기가 둘 돌지 않는다. 다른 PC나 다른 clone이어도 마찬가지다.
- 웹에서 새 실행을 멈추고 다시 시작할 수 있다. 진행 중인 실행은 끊지 않는다.
- Pro 이상 사용자는 PC만 켜 두면 웹 승인 뒤의 단계가 이어진다. 커밋은 로컬까지만 하고 push는 하지 않는다.
- 작업 유형: 기능 추가(서버 모듈·REST 경로·DB 테이블, 웹 배너, 플러그인 CLI·스킬), 계약 문서 갱신.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 마이그레이션이 있다(새 테이블 하나, `Project`에 nullable 열 하나). 공유 Neon이라 적용이 곧 운영 반영이다.
- REST 계약이 하나 늘고, 플러그인 CLI의 이벤트 계약이 바뀐다. 플러그인 판 상승과 Windows 번들 재패키징이 필요하다.
- 5개 이상의 파일이 바뀌고, 롤백은 서버·플러그인 판 상승을 함께 고려해야 한다.

## 결정 기록 (2026-10-20 grill-me, 사용자 확정)

| # | 결정 |
| --- | --- |
| 1 | Claude Code 전용. 감시·실행 코어는 OS 공통(Node), 로그인 자동 시작·OS 알림은 이번에 Windows만 |
| 2 | 상주 실행기는 **Pro 이상 전용**. 서버가 Free 프로젝트의 상주 lease를 거절한다. 1단계 세션 감시는 Free에서도 허용한다. Pro → Free로 내려가면 진행 중인 실행은 끝내고 다음 생존 신호에서 "플랜" 사유로 멈춘다 |
| 3 | 제안서 하나, Phase A(표시) → B(상주). 승인은 한 번, 출시는 두 번 |
| 4 | 서버에 실행기 상태 보고를 추가한다(서버·DB 변경). 보고 내용: 시작(PC·브랜치), 생존 신호, 현재 작업, 정지 이유. (같은 날 최적안 검토에서 "현재 작업"은 실행기가 따로 보고하지 않고 배너가 이미 쓰는 열린 AgentRun으로 보이기로 바꿨다 — A-1) |
| 5 | 프로젝트당 실행기 하나(서버 lease). 두 번째는 시작을 거절하고 첫 번째의 위치를 안내한다. 생존 신호가 끊기면 넘겨받을 수 있고, 명시적으로 교체할 수도 있다. 사람이 연 대화 세션은 lease 대상이 아니다 |
| 6 | 1단계 `/harness:watch` CLI도 같은 보고·lease에 참여한다 |
| 7 | 모든 탭 배너에 실행기 줄: 실행 중 / 응답 없음 / 정지(이유) / 일시 정지. 실행기가 없으면 기존 안내. 프로젝트 목록 카드에도 한 줄 |
| 8 | 웹 "일시 정지/재개" 스위치를 **배너의 실행기 줄 옆**에 둔다. 새 실행만 막고 진행 중인 실행은 끝까지 둔다. 1단계 세션도 따른다. 프로세스 종료는 로컬 명령만 |
| 9 | 옛 플러그인 판의 watch는 서버가 구별할 수 없어 보이지 않고 제한도 받지 않는다. 이를 한계로 적고, 실행기 없음 안내에 "최신 플러그인에서만 표시"를 덧붙인다 |
| 10 | 별도 스킬(start/stop/status/자동 시작 켜기·끄기)과, 같은 동작을 하는 `harness.ps1` 터미널 명령. 웹에서 시작하는 기능은 없다. 새 일을 시작할지는 시작할 때 묻고, 기본값은 이어 가기만 |
| 11 | 본 checkout에서 시작 브랜치에 고정한다. 실행 직전 검사에서 미커밋 변경이 있거나 다른 브랜치면 **대기**한다. 상태로 보고하고 Windows 알림을 한 번 띄우며, 조건이 풀리면 자동으로 재개한다 |
| 12 | 커밋은 허용으로 고정, push는 금지 |
| 13 | auto 모드 + `--settings` 허용 목록 + `git push` `--disallowedTools` 차단. auto를 쓸 수 없는 계정은 dontAsk + 허용 목록으로 대체하고 그 사실을 표시한다 |
| 14 | 연속 3회 실패하면 정지(비정상 종료·시간 초과·진전 없음). 실행 1회 시간 상한 기본 2시간, `--max-budget-usd`는 기본으로 끄고 선택 |
| 15 | 정지·실패는 배너 + Windows 알림. Inbox 카드는 만들지 않는다 |
| 16 | 로그는 `.git/harness/runs/`, 최근 50개. 서버에는 결과 한 줄과 로그 파일 이름만. 알릴 내용은 보류 → Inbox, 보고 → History 통로로만 |
| 17 | 로그인 자동 시작은 선택 기능, 기본 꺼짐. 시작 검사는 수동 시작과 같고, 켜져 있으면 배너에 표시 |
| 18 | 범위 밖: 휴대폰 push·메일, 웹에서 시작·종료, macOS, Codex, 무인 push, 도구 이름 접두어 누락 |

이 문서가 위 결정 위에서 새로 정한 것(검토 요청)은 [검토 요청](#검토-요청) 절에 모았다. 2026-10-20 사용자가 일곱 개 모두 확인했다.

## Current State

**서버는 실행기를 모른다.**
- 1단계 CLI는 시작할 때 `project_get`, 이후 key 없는 `pipeline_next`만 부른다(`plugin/bin/harness-watch.mjs`의 `startWatch`·`pollWatch`).
- 프로토콜은 이를 계약으로 적어 두었다. "서버 도구 집합·인증·사용 기록·DB를 감시 구현에서 바꾸지 않는다."(`docs/architecture/protocol.md:167`)
- 서버가 실행기에 대해 저장하는 값은 `Project.executorKind`(`local | routine`) 문자열 하나다(`prisma/schema.prisma:44`). 생존 여부는 없다.
- 토큰의 `lastUsedAt`은 있지만, watch와 사람이 연 대화 세션이 같은 hu_ 토큰을 쓰므로 그 값으로 실행기를 구별할 수 없다(`protocol.md`의 "토큰 인증 사용 기록" 절).

**잠금은 같은 저장소 안에서만 통한다.**
- 1단계 잠금은 공통 Git 디렉터리의 `harness/watch.lock.json`이다(`plugin/runtime/local-session.mjs`의 `stateFiles`).
- 프로토콜이 한계를 적어 두었다. "로컬 잠금은 다른 clone/기기·수동 세션을 잠그거나 이미 실행된 agent/in-flight 요청을 취소하지 않는다."(`protocol.md:188`)
- 잠금의 `mode`는 `watch`와 `foreground` 둘뿐이다(`local-session.mjs:72`). 1단계 poll은 `mode`가 `watch`, client가 `claude`가 아니면 거절한다(`harness-watch.mjs:275`).

**웹 배너는 상태와 상관없는 안내문을 보인다.**
- `WATCH_LINE`(`src/fsd/widgets/turn-banner/model/turn.ts:170`)은 "Next, in Claude Code" 상자 안에 늘 같은 문장으로 붙는다(`ui/next-step.tsx:31-33`). 이 문장은 product-copy §5의 잠금 블록 `turn-banner-watch`다(`docs/conventions/product-copy.md:231-233`, `docs/architecture/verification.md:327`).
- 큰 배너는 Board와 Inbox에만 있고, 나머지 탭과 항목 페이지는 한 줄 스트립이다(`ui/turn-banner.tsx:32-33`, product-copy §5 머리 `:175-177`).
- 배너는 `"use client"` 컴포넌트이고 실시간 갱신은 없다. 내비게이션·새로고침 때 서버 렌더가 다시 읽는다.

**1단계 스킬이 이 작업을 미래 일로 남겨 두었다.** "Do not add `--spawn`: the resident executor, automatic push, global cross-clone locking, hosted/routine execution and server heartbeat are separate future work."(`plugin/skills/watch/SKILL.md:218-219`) 이 문서는 그중 상주 실행기, 저장소 간 잠금(서버 lease), 서버 heartbeat를 다룬다. 자동 push와 hosted/routine 실행은 여전히 범위 밖이다.

**smoke 관찰(2026-10-20).** `claude --bg` 세션이 남긴 "주인에게 알릴 것" 메모는 세션 안에만 머물렀다. 열린 결정 보류 규칙으로 원인 하나는 Inbox 통로로 옮겼지만, 창 없는 실행기에서는 "알려야 할 일이 화면에 안 닿는" 경우가 기본값이 된다. 이것이 표시 장치를 실행기와 같은 무게로 다루는 이유다.

## Scope

포함 범위:

- Phase A
  - 서버: 실행기 lease·상태·일시 정지 저장, REST 경로 하나, 플랜 판정, 웹 일시 정지 Action
  - 웹: 배너(큰 배너·스트립)의 실행기 줄과 일시 정지 스위치, 프로젝트 목록 카드 한 줄
  - 플러그인: 1단계 watch CLI·세션 CLI의 보고·lease 참여, watch 스킬 갱신, 판 상승
  - 문서: protocol·server·verification·product-copy·CONTEXT 갱신
- Phase B
  - 플러그인: 상주 실행기 CLI·런타임, 새 스킬, `harness.ps1` 작업 추가, Windows 알림·자동 시작, watch 스킬의 한 번 실행 갈래
  - 웹: `/billing` 플랜 표의 행과 배너의 Free 줄(B-5)
  - 문서: protocol 상주 절, product-copy §5(Free 줄)·§15

제외 범위:

- Codex 실행기(C4는 `codex-dual-client-runtime-follow-ups.md`가 계속 소유한다)
- macOS·Linux의 자동 시작과 OS 알림(코어는 OS 공통으로 쓰되 이번에 붙이지 않는다)
- 휴대폰 push·메일 알림, 웹에서 실행기 시작·종료
- 공개 문서(`/docs`)와 product-copy §20 변경(검토 요청 7)
- 무인 push, 게이트 자동 승인(게이트는 언제나 사람만 연다)
- 도구 이름 접두어 누락(모델 행동 문제, 별도)
- 런북·에이전트 템플릿 변경과 DB 재시드(이 문서는 템플릿을 바꾸지 않는다)

## 대안 검토

### Phase B 대안 1: `claude --bg` + `/harness:watch` — 택하지 않음

2026-10-20 smoke 두 번은 이 방식으로 사람 개입 없이 인수까지 갔다. 1단계를 그대로 재사용하고, Claude Code의 감독 프로세스가 수명, 목록(`claude agents`), attach, 로그, 중지를 제공한다. 새 코드가 가장 적은 길이다. 그래도 택하지 않는 이유는 공식 문서([agent-view](https://code.claude.com/docs/en/agent-view.md), 2026-10-20 확인, CLI 2.1.304, 페이지 앞 10만 자만 읽음)가 적은 세 동작이 결정과 충돌하기 때문이다.

1. **본 checkout에서는 커밋 전에 사람에게 묻는다.**
   - `worktree.bgIsolation`을 `"none"`으로 두면 worktree 없이 작업 트리를 직접 고친다.
   - 그러나 문서에 "A session editing a checkout it didn't isolate itself still asks before committing or switching branches."라고 되어 있다.
   - 무인 세션의 질문은 답할 사람이 없어 멈춘다. 결정 11(본 checkout)과 결정 12(커밋 허용 고정)를 함께 만족할 수 없다.
   - 반대로 격리(기본값)를 쓰면 커밋이 worktree 브랜치에 쌓인다. smoke 결정 6이 피하려던 바로 그 상황이다.
2. **한 시간쯤 놀면 프로세스가 멈춘다.**
   - 문서: "Finished or waiting for your next message, and unattached for about an hour: the supervisor stops the process to free resources."
   - watch는 할 일이 없으면 최대 110분 대기한다. 그사이 세션 프로세스가 멈출 수 있다.
   - 백그라운드 셸 명령은 다음 프로세스로 넘어간다고 되어 있지만, 그 명령이 끝났을 때 멈춘 세션을 깨우는지는 문서에 없다.
   - 막으려면 agent view에서 `Ctrl+T`로 고정해야 하는데, 이건 대화형 키다.
3. **알림과 재시작이 없다.**
   - 알림: "While agent view is open, Claude Code also sends a notification …" — agent view가 열려 있을 때만 온다.
   - 재부팅: "Shutting down or restarting your machine stops running background sessions." 로그인 때 자동으로 시작하는 기능은 문서에 없다.

매번 짧게 끝나는 `claude -p`를 감독 프로세스가 띄우면 세 문제가 생기지 않는다. bg 전용 커밋 질문이 없고, 놀고 있는 세션이 없고, 알림과 시작을 직접 소유한다. 다만 `-p`에도 커밋 전에 묻는 규칙이 없는지는 B 1단계 spike에서 함께 확인한다.

### Phase B 대안 2: 설계 문서의 `harness-watch.mjs --spawn` — 택하지 않음

설계 문서(`2026-10-03-local-watch-executor.md:447-453`)는 1단계 CLI에 `--spawn` 모드를 더하자고 했다. 1단계 CLI는 "한 줄 JSON을 내고 끝나는" 계약이고 스킬이 그 출력을 검증한다. 오래 사는 감독 프로세스(자식 프로세스, 로그, 알림, 신호)를 같은 진입점에 넣으면 두 계약이 섞인다. 그래서 진입점은 나누고, 잠금·세션 코드(`local-session.mjs`)와 작업 판정(`lib/watch.mjs`)을 공유한다.

### Phase A 대안: MCP 도구 / 표시만

- **MCP 도구 `runner_report`.** 실행기 CLI 입장에서는 가장 가깝다. 하지만 `mcp__harness__*` 목록에 실려 모든 에이전트 모델이 보게 된다. 모델이 lease를 건드릴 수 있는 길을 만들 이유가 없어서 REST로 둔다.
- **표시만(lease 없음).** 가장 단순하지만 결정 5(프로젝트당 하나)를 충족하지 못한다.

### Pro가 주는 것과 새는 곳

1단계 watch는 Free에서도 허용된다(결정 2). 그래서 Free 사용자도 `claude --bg "/harness:watch …"`로 창 없이 돌릴 수 있다. 서버 lease에는 `session`으로 보인다. Pro 플래그가 막는 것은 이 문서의 background 실행기이고, "창 없는 실행" 자체는 막지 못한다.

**받아들이고, Pro가 주는 것을 정확히 적는다**(2026-10-20 사용자 확인). Pro의 background 실행기가 `claude --bg` 경로에 없는 것으로 주는 것은 다음과 같다.
- 본 checkout에서 묻지 않고 커밋
- 미커밋·브랜치 대기와 자동 재개
- 실패·시간 상한
- Windows 알림
- 로그인 자동 시작
- 놀다가 멈추지 않는 수명

Free 경계는 원래 "사람 승인 없이 끝까지 가지 않는다"(게이트)에 있고, 이 차이는 그 경계를 건드리지 않는다.

watch CLI가 bg 세션을 감지해 `resident`로 보고하게 하는 방법은 택하지 않는다. 감지 신호(job 디렉터리 환경 변수 등)를 확인하지 못했고, 우회도 쉽기 때문이다.

## Proposal

### 용어

- **실행기(runner)**: 파이프라인 일을 자동으로 이어 가는 로컬 프로세스. 두 종류가 있다.
  - `session`: 1단계. 사용자가 연 Claude Code 세션 + `/harness:watch`
  - `resident`: 2단계. 창 없이 도는 상주 프로세스가 `claude -p`를 띄운다
- **lease**: 서버가 프로젝트마다 하나만 내주는 실행 권리. 로컬 잠금(`watch.lock.json`)은 같은 저장소 안의 중복을 막고, lease는 PC와 clone 사이의 중복을 막는다.
- 화면 문구에서는 "runner"를 쓴다. "harness"·"executor"는 식별자에만 남긴다(product-copy §2).

### Phase A — 표시

#### A-1. 데이터 모델

```prisma
model Runner {
  projectId  String   @id
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  session    String   // 로컬 세션 id(watch.lock.json의 id, UUID). lease 소유 판정은 이 값 하나로 한다
  tokenId    String   // lease를 잡은 토큰(hs_/hu_의 내부 id). 감사 기록용이며 판정에 쓰지 않는다(토큰을 바꿔도 lease는 유지)
  mode       String   // session | resident
  host       String   // os.hostname(), 64자로 자른다
  branch     String?  // resident만: 시작 때 고정한 브랜치
  permission String?  // resident만: auto | allowlist(auto를 쓸 수 없어 허용 목록만으로 도는 경우, B-3)
  autostart  Boolean  @default(false)
  state      String   // idle | working | waiting | stopped
  waitReason String?  // state=waiting일 때 dirty | branch
  lastResult String?  // 마지막 실행 결과 한 줄, 150자
  lastLog    String?  // 마지막 로그 파일 이름(경로 아님)
  stopReason String?  // state=stopped일 때 코드(아래 표)
  startedAt  DateTime
  seenAt     DateTime
}

model Project {
  // …
  runnerPausedAt DateTime? // null = 일시 정지 아님. 실행기가 없어도 유지된다(다음 실행기가 정지 상태로 시작)
  runner         Runner?
}
```

- **지금 하는 일은 저장하지 않는다.** 배너는 이미 열린 AgentRun으로 "dev is implementing ITEM-01" 같은 줄을 만든다(`turn-data.server.ts`의 `workingLine` 입력). 실행기가 같은 내용을 따로 보고하면 출처가 둘이 되어 서로 어긋날 수 있다. 실행기는 생존과 상태만 보고한다.
- 프로젝트당 한 행이다. 새 시작이 행을 덮어쓴다. 정지한 행은 `state=stopped`로 남겨서 "정지됨(이유)"을 보인다.
  - 소유자가 직접 정지(`owner`)하면 행을 지운다. 보일 이유가 없기 때문이다.
- 마이그레이션은 추가형이다. 새 테이블 하나와 `Project`의 nullable 열 하나뿐이다.
- `executorKind`는 건드리지 않는다. 그 값은 실행 주체가 로컬인지 클라우드 루틴인지를 가리키는 다른 축이다.

**정지 이유 코드**

| 코드 | 언제 | 화면 |
| --- | --- | --- |
| `owner` | 로컬 중지 명령 | 행 삭제(표시 없음) |
| `stuck` | 같은 일이 진전 없이 반복(기존 stuck 규칙 / Phase B 연속 3회 실패) | 정지 + 이유 |
| `error` | 연속 전송 실패·프로토콜 오류 등 CLI 오류 이벤트 | 정지 + 이유 |
| `plan` | 상주 실행기인데 플랜이 Pro 미만이 됨 | 정지 + 이유 |
| `replaced` | 다른 실행기가 lease를 가져감 | 행이 새 실행기로 바뀌므로 표시 없음. 정지된 쪽 로컬에만 알림 |

#### A-2. 생존 판정

순수 함수로 `packages/core/runner.mjs`에 둔다. 서버(lease 판정)와 웹(표시)이 같은 함수를 쓴다(`docs/architecture/README.md` 규칙 5).

| mode·state | 응답 없음 기준 | 근거 |
| --- | --- | --- |
| `resident` 전부 | 마지막 신호 뒤 3분 | 상주 프로세스는 `claude -p`가 도는 동안에도 60초마다 신호를 보낸다. 3분 = 폴링 세 번 |
| `session` · `idle`/`waiting` | 3분 | 1단계 CLI가 무장해 있으면 폴링마다 신호를 보낸다 |
| `session` · `working` | 마지막 신호와 **프로젝트의 마지막 에이전트 활동** 중 늦은 쪽 뒤 60분 | 1단계 CLI는 `work`를 내고 끝나며, 세션이 일을 하는 동안 CLI가 없다. 신호는 스킬이 디스패치마다 부르는 `--check`에서만 온다(A-4). 그래서 서버가 이미 계산하는 프로젝트별 최근 에이전트 활동을 함께 본다. 한 단계가 수십 분 걸릴 수 있어 60분을 둔다(smoke D의 plan-verifier 12–14분, smoke A의 한 항목 전체 31분) |

- **마지막 에이전트 활동.** 그 프로젝트의 `AgentRun.openedAt`과 `AgentRunStep.at` 중 최신값이다. 플랜 변경 때 사용 목록을 고르는 코드가 같은 값을 이미 계산한다(`src/server/projects/availability-service.ts:114-124`). 새 쓰기는 없다.
  - 그 코드는 run과 step을 모두 읽어 메모리에서 최신값을 고른다. 모든 탭의 레이아웃이 부르는 자리에는 맞지 않으므로 그대로 옮기지 않는다. 대신 두 집계(`agentRun.aggregate({ where: { projectId }, _max: { openedAt: true } })`, `agentRunStep.aggregate({ where: { run: { projectId } }, _max: { at: true } })`)로 읽는다.
  - 행이 `mode=session`, `state=working`일 때만 읽는다. 다른 상태의 판정에는 필요 없다.
  - 다른 세션의 에이전트 활동도 섞인다는 한계가 있다. 같은 프로젝트에서 사람이 직접 연 세션이 일하고 있으면 "작업 중"이 더 오래 유지된다. 프로젝트 기준의 활동이므로 실행기 판정에는 해가 없다고 본다.
  - 화면은 이 값을 "last activity N min ago"로 보인다(A-5).
- **판정 함수 입력.** `runner.mjs`의 판정 함수는 (행, 마지막 에이전트 활동, 현재 시각)을 받는다. lease 판정은 서버가, 표시는 웹 로더가 같은 입력으로 부른다.
- **lease를 잡고 있는 행.** `state`가 `stopped`가 아니고 응답 없음 기준 안에 있는 행만 lease를 잡고 있다. 행이 없거나, `stopped`이거나, 응답 없음이면 새 `start`가 `takeover` 없이 행을 덮어쓴다.
- **응답 없음 = lease 만료.** 이 기준을 넘긴 lease는 다른 실행기가 확인 없이 넘겨받을 수 있다.
- **명시적 교체.** 살아 있는 lease도 시작 요청에 `takeover:true`를 실으면 넘겨받는다. 스킬은 이 플래그를 소유자의 확인을 받은 뒤에만 보낸다.
- **넘겨준 쪽.** 다음 신호에서 `replaced`를 받고 멈춘다.

#### A-3. REST 경로 `POST /api/runner`

MCP 도구가 아닌 REST로 둔다. MCP 도구로 만들면 `mcp__harness__*` 목록에 실려 모든 에이전트 모델이 보게 되고, 모델이 lease를 잘못 건드릴 수 있다. 실행기 CLI는 이미 JSON-RPC를 직접 보내므로 REST 하나를 더 부르는 비용이 작다. 기존 REST 경로(`/api/runbook` 등)와 같은 모양을 따른다.
**파일과 소유.** `rest` 모듈이 REST 주체·입력·HTTP 응답을 소유하고(`docs/architecture/server.md:21`), 새 `runners` 모듈이 lease·상태·일시 정지를 소유한다.

| 파일 | 역할 |
| --- | --- |
| `src/app/api/runner/route.ts` | 배선만. `POST`가 본문을 읽어 `runnerRequest`를 부르고 `runnerResponse`로 답한다(`src/app/api/runbook/route.ts`와 같은 모양) |
| `src/server/rest/runner-handler.ts`(+`runner-handler.test.ts`) | 주입형 판정: 주체(`resolveRestScope`, `src/server/rest/scope.ts`) → 접근 → 요청 제한 → 본문 검사 → 서비스 호출. 결과 타입과 `runnerResponse`(코드·holder를 보존하는 응답)를 둔다 |
| `src/server/rest/runner.ts` | `server-only` 바인딩(`src/server/rest/runbook.ts`와 같은 모양). 실제 토큰 조회·사용 기록·요청 제한·`runners/api.server.ts`를 묶는다 |
| `src/server/rest/api.server.ts`, `src/server/rest/api.ts` | `runnerRequest`, `runnerResponse` 공개 |
| `src/server/runners/runner-service.ts` | 트랜잭션 안의 `start`·`beat`·`stop`, 일시 정지 설정, 웹이 읽는 조회(행·일시 정지·마지막 에이전트 활동) |
| `src/server/runners/api.ts` | 주입형 서비스 공개(`runRunnerOp`, `setRunnerPaused`, `readRunnerState`, `readRunnerSummaries`) |
| `src/server/runners/api.server.ts` | prisma 바인딩 공개 — rest 바인딩·FSD api adapter가 읽는다 |
| `src/server/runners/contracts.ts` | 모듈 밖이 쓰는 서버 타입(`RunnerOpResult`, `RunnerRecord`). FSD의 model/ui는 이 타입을 import하지 않는다(A-5) |

- `restFailureResponse`(`src/server/rest/response.ts`)는 `error`만 남기고 `code`·추가 필드를 버린다(`failureBody`, `src/server/result.ts:10-14`). 그래서 runner 경로는 그 함수를 쓰지 않고 `runnerResponse`가 아래 표의 본문을 그대로 만든다. 429만 기존 `failureBody`의 모양(`code:"RATE_LIMITED"`, `retryAfterSec`, `Retry-After`)을 따른다.
- 경계 갱신:
  - `scripts/verify-server-boundaries.mjs`의 `directions`(`:6-11`)에 `runners: ["projects"]`를 더하고, `rest`에 `"runners"`를 더한다. `runtimeAssembly`(`:15-18`)에는 `"rest/runner.ts"`를 더한다.
  - `docs/architecture/server.md`의 모듈 표(`:12-22`), 조립부 목록(`:43`), 공개 symbol 표(`:54-75`, rest 행의 "네 REST 바인딩"과 route 목록 포함)를 같이 고친다.

**요청과 응답.** 본문은 JSON이다. 공통 필드는 `project?`(hu_면 필수)와 `session`(UUID 모양)이다.

| op | 본문 | 성공 200 | 거절 |
| --- | --- | --- | --- |
| `start` | `mode`(`session`/`resident`), `host`(1–64자), `branch?`(resident 필수, 1–255자), `permission?`(`auto`/`allowlist`, resident 필수), `autostart?`(boolean), `takeover?`(boolean) | `{ok:true, paused}` | 409 `{error, code:"RUNNER_BUSY", holder:{mode, host, seenAt}}` · 403 `{error, code:"PLAN_REQUIRED"}`(resident, 플랜이 허용하지 않음) |
| `beat` | `state?`(`idle`/`working`/`waiting`; 없으면 저장된 상태 유지), `waitReason?`(`dirty`/`branch`, `state=waiting`일 때만), `lastResult?`(≤150자), `lastLog?`(파일 이름, `/`·`\` 없음, ≤100자) | `{ok:true, paused, stop?:"plan"}` | 409 `{error, code:"RUNNER_REPLACED"}` |
| `stop` | `reason`(`owner`/`stuck`/`error`/`plan`) | `{ok:true}` | 409 `{error, code:"RUNNER_REPLACED"}` |

- 위 표를 벗어난 본문은 400 `{error:"Invalid runner request."}`이다. 인증·접근 거절은 기존 REST와 같은 401·403이다.
- **같은 요청을 두 번 받을 때**(응답이 사라져 CLI가 다시 보낸 경우).
  - `start`: 행의 `session`이 같으면 성공으로 답하고 `seenAt`만 갱신한다. 같은 세션이 자기 자신에게 BUSY를 받지 않는다.
  - `beat`: 멱등이다.
  - `stop`: 행이 없으면 성공이다(소유자 정지로 이미 지워진 경우). 행이 있고 `session`이 같으면 이미 `stopped`여도 성공이다.
  - `session`이 다른 행에 대한 `beat`·`stop`은 `RUNNER_REPLACED`다. 행이 아예 없거나 `state=stopped`인 행에 대한 `beat`도 `RUNNER_REPLACED`다. 소유자 정지로 지워졌거나, 다른 실행기가 덮어썼거나, 이미 정지해 lease를 잡고 있지 않은 경우다. 받은 CLI는 멈춘다.
- **서로 다른 두 실행기의 경합.**
  - 모든 op는 한 트랜잭션 안에서 User → Project 순서로 `FOR UPDATE` 잠금을 잡는다(`lockProjectOwnerIn`, `src/server/projects/availability-service.ts:65-67` → Project 행). `src/server/pipeline/automatic-scout.ts`의 `setAutomaticScout`와 같은 순서다.
  - 접근·플랜(`readProjectAccessIn`, `src/server/projects/access-query.ts:47`)과 `Runner` 행은 잠근 **뒤에** 읽는다.
  - 격리 수준은 기본(READ COMMITTED)이다. 그래야 잠금 뒤의 각 문장이 새 스냅숏을 본다. Serializable 트랜잭션의 첫 읽기가 잠금보다 앞서면 잠금 전 스냅숏을 보는 문제가 이 저장소에서 실측됐다.
  - 동시에 들어온 두 `start` 중 뒤의 것은 앞의 것이 쓴 행을 보고 BUSY를 받는다. 행 쓰기는 `projectId` 기본키의 upsert라 잠금 아래에서 중복 삽입이 생기지 않는다.
- **시계.** `startedAt`·`seenAt`을 쓰는 시각과 lease 판정의 현재 시각은 트랜잭션 안의 DB 시계(`readDatabaseClockIn`, `src/server/database-clock.ts`)다. 사용량 구간(`src/server/usage/request-rate-service.ts`)과 같은 출처다. 마지막 에이전트 활동(`AgentRun.openedAt`·`AgentRunStep.at`)도 DB의 `now()` 기본값이라 같은 시계다. 앱 서버 시계는 쓰지 않는다.
- **쓰기 줄이기.** `beat`는 상태 필드가 그대로이고 `seenAt`이 30초 안이면 쓰지 않는다. 토큰 `lastUsedAt` 기록이 60초 조건으로 쓰기를 줄이는 것과 같은 방식이다.
- **플랜 판정.** `packages/core/entitlement.mjs`의 `LIMITS`(`:14-18`)에 `residentRunner` 플래그를 더한다(free:false, pro·max:true). 같은 파일의 `OWNER_TOKEN_PLAN_GATE`처럼 문장 상수 `RESIDENT_RUNNER_PLAN_GATE`도 둔다(문구는 아래 §12 표).
  - resident `start`는 플래그가 false면 거절한다.
  - resident `beat`는 거절하지 않고 `stop:"plan"`을 돌려준다. 실행기가 진행 중인 실행을 끝낸 뒤 멈추게 하려는 것이다(결정 2).
  - session 모드는 플랜과 무관하다.
- **접근.** 선택되지 않았거나 연결이 끊긴 프로젝트는 기존 REST처럼 403과 사유를 돌려준다(`src/server/rest/runbook-handler.ts`와 같은 판정).
- **요청 제한.** 프로젝트 300회/10분 구간에 함께 센다. 신호 1회/분 + 1단계 폴링 1회/분이면 10분에 20회다. protocol.md의 "15개 agent 도구·owner `gate_approve`·네 REST 경로"(`protocol.md:119`)를 "다섯 REST 경로"로 고친다.

**거절 문구(product-copy §12에 추가).**

| 코드 | 문장 |
| --- | --- |
| `RUNNER_BUSY` | `A runner is already running for this project on {host} (last signal {time} UTC). Stop it there, or take it over.` |
| `PLAN_REQUIRED` | `The background runner opens on Pro. Use /harness:watch in a Claude Code session for now.` (`RESIDENT_RUNNER_PLAN_GATE`) |
| `RUNNER_REPLACED` | `Another runner took over this project. This one stops.` |
| 400 | `Invalid runner request.` |

#### A-4. 1단계 CLI 참여

| CLI | 지금 | 바뀐 뒤 |
| --- | --- | --- |
| `harness-watch.mjs --start --managed [--takeover]` | `project_get` → 로컬 잠금 | `project_get` → 로컬 잠금 → `start`(mode `session`, `takeover`는 플래그가 있을 때만). 일시적 실패(전송 오류·408·429·5xx)는 `project_get`과 같이 5번까지 다시 보낸다. 같은 `session`으로 다시 보내므로 서버가 이미 받았어도 BUSY가 되지 않는다. `RUNNER_BUSY`면 로컬 잠금을 지우고 새 이벤트 `busy`(holder 포함, exit 0)를 낸다. `--takeover`는 `--start`와만 같이 쓸 수 있다. 성공하면 로컬 잠금에 `runnerLease: true`를, 404면 `runnerLease: false`를 쓴다(아래 "lease 기록") |
| `harness-watch.mjs --session` (poll) | 60초마다 `pipeline_next` | 폴링마다 `beat`(state `idle`) 뒤 `pipeline_next`. `paused`면 `work`를 내지 않고 계속 폴링하며, 이때 **작업 반복 상태(`nextWatchState`)를 갱신하지 않는다**. 갱신하면 일시 정지 세 번 만에 거짓 `stuck`이 된다(`harness-watch.mjs:313`, `lib/watch.mjs`의 `STUCK_AFTER = 3`). `work`를 낼 때 `beat`(state `working`). `beat`의 `RUNNER_REPLACED`는 기존 `replaced` 이벤트로 끝낸다. `beat`의 일시적 실패는 기존 연속 전송 실패 횟수(5회면 `error`)에 함께 센다. `stuck`·`error`로 끝날 때는 종료 전에 `stop`(reason `stuck`·`error`)을 한 번 보낸다. 그 요청이 실패해도 원래 이벤트와 종료 코드는 그대로다 |
| `harness-session.mjs --check` | 로컬 소유권만 | 잠금의 `mode`가 `watch`(Phase B부터 `resident`도)이고 client가 `claude`이며 `runnerLease`가 `true`일 때만: 로컬 소유권 + `state` 없는 `beat`(저장된 상태 유지 — 스킬은 디스패치 전에도, 재무장 전에도 부르므로 상태를 정할 수 없다). 결과 `owned`에 `paused`(boolean)를 싣는다. 서버에 닿지 않으면 `paused` 대신 `server:"unreachable"`을 싣고 통과한다(일시 정지 확인만 못 한다). 404면 두 필드 모두 없이 통과한다. `RUNNER_REPLACED`면 `replaced`. **그 밖의 세션(`mode: "foreground"`, Codex)은 지금과 같고 `/api/runner`를 부르지 않는다** |
| `harness-session.mjs --release` | 로컬 잠금 해제(토큰·서버 인자 없이) | 로컬 해제 뒤, 해제한 잠금이 `mode: "watch"`(Phase B부터 `resident`도)이고 `runnerLease: true`였으며 `binding.server`와 환경의 토큰이 있으면 `stop`(reason `owner`)을 보낸다. 실패해도 해제는 성공이다. 이때 서버 행은 남아서 3분 뒤 "No signal"로 보이다가 다음 시작이 덮어쓴다 |
| `--stop` | 토큰·서버 없이 동작 | 그대로 둔다. 오프라인에서도 멈출 수 있어야 한다 |

- **서버가 경로를 모를 때.** `start`가 404를 받으면 그 서버에는 runner 경로가 없는 것으로 보고, 오늘처럼 로컬 잠금만으로 계속 돈다. 서버를 먼저 배포하므로 정상 출시에서는 생기지 않는다. 서버를 롤백했을 때 플러그인이 멈추지 않게 하려는 장치다.
- **lease 기록.** `--check`·`--release`·poll은 매번 새 프로세스라서, "lease를 잡았는가"를 프로세스 기억으로 둘 수 없다. 그래서 `start` 결과를 로컬 잠금의 새 최상위 키 `runnerLease`(boolean)에 남긴다.
  - poll·`--check`·`--release`는 이 값이 `true`일 때만 `/api/runner`를 부른다.
  - `false`(404로 시작)인 세션은 끝까지 로컬 잠금만으로 돈다. 도중에 서버가 경로를 갖게 되어도 행이 없다는 이유로 `RUNNER_REPLACED`를 받아 멈추지 않는다.
  - 실행 중에 poll·`--check`가 404를 받으면(서버 롤백) 그 호출만 건너뛰고 계속 돈다.
  - `readState`(`local-session.mjs:49-76`)는 이 키가 있으면 boolean인지 검사한다. 옛 판은 모르는 키를 검사하지 않으므로 그대로 읽는다.
- **요청 대상.** CLI는 `binding.server`(기존 서버 URL)에 `/api/runner`를 붙인다. hu_면 `binding.project`를 본문 `project`로 보낸다. 토큰은 지금처럼 환경 변수에서만 읽는다. `--release`도 같은 값을 쓴다.
- **어디에 넣는가.** `beat`·`stop` 호출은 CLI 진입점(`harness-watch.mjs`, `harness-session.mjs`의 `main`)에 둔다. `plugin/runtime/local-session.mjs`의 `checkSession`·`releaseSession`은 바꾸지 않는다. 그 함수는 Codex 경로도 그대로 쓴다(`plugin/bin/harness-codex.mjs`, `plugin/runtime/codex-thread.mjs`의 `roleBridge`).
- **watch 스킬**(`plugin/skills/watch/SKILL.md`).
  - §4 이벤트 스키마에 `busy`(`holder:{mode, host, seenAt}`)를 더한다. `owned`에는 `paused` 또는 `server:"unreachable"`이 붙을 수 있다.
  - `busy`면 holder를 보여 주고 소유자에게 묻는다. 소유자가 교체를 원할 때만 `--start --managed --takeover`로 다시 시작한다.
  - 디스패치·인수·보고·재무장 전에 부르는 `--check`의 `paused`가 true면 새 일을 시작하지 않는다. 진행 중인 역할은 끝까지 둔다. 같은 일시 정지에 대해서는 한 번만 알린다.
  - "server heartbeat"와 "global cross-clone locking"을 미래 일 목록(`SKILL.md:218-219`)에서 뺀다.
- **스킬·CLI 문구(product-copy §15 "Local watch"에 추가).**
  - busy 질문: `A runner is already running for this project on {host} (last signal {time} UTC). Stop it there, or should I take over?`
  - 일시 정지 안내: `The runner is paused on the web. I start nothing new until you resume it there.`
  - 이벤트 목록에 `busy`(holder, exit 0), `owned`의 `paused`·`server` 필드를 더한다.
- **판 상승.** 플러그인 판을 dev 판 + 1로 올린다(지금 `0.5.12` → `0.5.13`). Windows 번들을 다시 패키징한다.

#### A-5. 웹 표시

- **타입 경계.** FSD는 `src/server`를 `api` segment의 서버 adapter에서만 import할 수 있다(`scripts/verify-fsd-boundaries.mjs:255-262`, `docs/architecture/fsd.md:176-178`). 그래서 웹이 쓰는 실행기 타입은 위젯 model에 둔다.
  - `src/fsd/widgets/turn-banner/model/runner.ts`(+`runner.test.ts`)가 `TurnRunner` 타입과 줄 문장을 만드는 순수 함수를 둔다. 생존 판정은 `@harness/core/runner.mjs`에서 가져온다. 기존 `TurnItem`이 같은 방식으로 위젯 model에 있다.
  - api adapter(`turn-data.server.ts`)가 서버 값을 그 타입으로 옮긴다. `runners/contracts.ts`의 타입은 api adapter만 읽는다.
- **읽기.** `loadTurn`(`src/fsd/widgets/turn-banner/api/turn-data.server.ts`)이 `runners/api.server.ts`의 `readRunnerState(projectId)`로 다음을 함께 읽는다. 결과는 `TurnData.runner: TurnRunner | null`로 싣는다.
  - `Runner` 행
  - `runnerPausedAt`
  - 마지막 에이전트 활동(A-2의 조건일 때만)
  - 그 조회에서 읽은 DB 시각(`renderedAt`, A-3의 시계)
- **플랜(Phase B).** Free 줄에 필요한 플랜은 레이아웃이 이미 읽는 `projectAccess(projectId)`의 `plan`(`src/app/(app)/p/[slug]/layout.tsx`의 `access`)을 넘긴다. 새 조회는 없다. Free 줄과 이 prop은 Phase B 출시 때 더한다(B-5).
- **판정과 시각.** "실행 중 / 응답 없음"과 "N min ago"는 A-2 함수로 계산한다.
  - 첫 렌더(서버 렌더와 hydration)는 서버의 `renderedAt`을 현재 시각으로 쓴다. 서버와 브라우저가 같은 문장을 만들어 hydration 불일치가 생기지 않는다.
  - 마운트 뒤 `useEffect`가 그때의 브라우저 시각과 `renderedAt`의 차이(시계 차이)를 한 번 재고, 이후 "브라우저 시각 + 그 차이"로 30초마다 다시 계산한다. 사용자 PC 시계가 어긋나도 "N min ago"와 "No signal"이 서버 판정과 같은 기준을 쓴다. 언마운트 때 interval을 지운다.
  - 그래서 페이지를 열어 둔 채로도 "No signal"로 바뀐다. 정지 같은 상태 변화는 지금처럼 새로고침·내비게이션 때 보인다(실시간 push는 범위 밖).
- **큰 배너(Board·Inbox).** 헤드라인 아래에 실행기 줄(`ui/runner-line.tsx`)을 두고, 줄 옆에 **Pause**/**Resume** 버튼을 둔다. 배너의 모든 종류(`setup`·`mine`·`theirs`·`none`, `model/turn.ts`의 `Turn`)에서 같은 자리에 보인다. 보드가 비어 있는 첫 실행 중에도 feature-scout를 돌리는 실행기가 있을 수 있기 때문이다.
  - 버튼은 실행기 행이 있거나 일시 정지 중일 때만 보인다. 실행기가 없고 정지 중도 아니면 없다.
  - 버튼 UI는 feature slice의 컴포넌트다(아래 일시 정지 Action).
- **스트립(나머지 탭·항목 페이지).** 기존 한 줄 끝에 짧은 상태(아래 스트립 표)를 덧붙인다. 버튼은 없다.
- **`WATCH_LINE`을 보일 때.** "Next, in Claude Code" 상자(`ui/next-step.tsx`)의 `WATCH_LINE`과 그 아래 추가 줄은 실행기가 **살아 있지 않을 때**만 보인다. 살아 있지 않다는 것은 행이 없거나, 응답 없음이거나, 정지인 경우다.
  - 살아 있는 실행기가 있으면 "그 세션에서 `/harness:watch`를 켜 두라"는 안내는 맞지 않으므로 숨긴다.
  - 상자 자체(이어 할 줄 목록)는 지금처럼 다음 할 일이 있을 때 보인다.
- **실행기 없음.** `WATCH_LINE` 아래에 최신 플러그인에서만 표시된다는 한 줄을 더한다(결정 9). Phase B부터는 Free 플랜이면 background runner가 Pro에서 열린다는 한 줄을 더한다(B-5). Phase A에는 Pro가 쓸 수 있는 background runner가 아직 없어서, 그때 이 줄을 보이면 없는 기능을 약속하게 된다.
- **새 prop은 모두 선택이다.** `TurnBanner`의 `runner`·`pause`(Phase B에서 `plan`)와 `NextStepContent`의 `showWatch`(기본 true)를 선택 prop으로 둔다. 값이 없으면 지금과 똑같이 그린다.
  - 그래서 기존 시험 `ui/turn-banner.test.ts`, `ui/next-step.test.mjs`, 브라우저 fixture `tests/server/fixtures/src-clean-code-browser.tsx:219`는 그대로 통과해야 한다.
  - 새 동작은 위 두 시험 파일에 사례를 더해 검증한다.
- **`turn-data.test.ts`.** 이 시험은 `loadTurn`을 VM에서 돌리며 import를 모두 가짜로 바꾼다(`api/turn-data.test.ts:20-29`). 새 import(`@/server/runners/api.server`)와 조회를 가짜 목록에 더해야 한다. 실행기 행이 없을 때 `runner: null`인지 확인하는 사례도 더한다.
- **프로젝트 목록 카드.** `src/server/projects/availability-service.ts`는 바꾸지 않는다. 목록 adapter `src/fsd/pages/project-list/api/project-list.server.ts`가 `loadProjectAvailability` 결과의 프로젝트 id로 `runners/api.server.ts`의 `readRunnerSummaries(ids)`를 한 번 더 부르고, 행마다 `runner` 요약을 붙인다.
  - 고칠 파일: `ui/project-list-page.tsx`(`ProjectListModel` 행 타입과 표시), `model/project-list-copy.ts`(`activityLines`에 실행기 줄), `model/project-list-copy.test.ts`, `ui/project-list-page.test.mjs`
  - 다른 브랜치 WIP가 고치는 `availability-service.ts`와 겹치지 않는다.
- **일시 정지 Action.** 새 feature slice `src/fsd/features/pause-runner/`를 만든다.
  - `api/pause-runner.server.ts`: `"use server"`. `requireProjectWrite(slug)`(`src/server/auth/guard.ts:25-29`, 소유자이고 사용 가능한 프로젝트) → `runners/api.ts`의 `setRunnerPaused` → `revalidatePath(projectPath(slug), "layout")`. `src/fsd/features/edit-pipeline/api/automatic-scout.server.ts`와 같은 모양이다.
  - `ui/pause-runner-button.tsx`: `"use client"`. 묶인 Action을 prop으로 받는다.
  - `index.ts`(버튼), `index.server.ts`(Action)
  - 규칙은 서버 서비스에 둔다. "use server" Action은 시험에서 부를 수 없기 때문이다.
  - `setRunnerPaused`는 멱등이다. 이미 일시 정지면 `runnerPausedAt`을 바꾸지 않고, 재개는 `null`로 둔다. User → Project 잠금 순서는 A-3과 같다.
  - 레이아웃(`src/app/(app)/p/[slug]/layout.tsx`)이 slug를 묶어 `TurnBanner`의 `pause`로 넘긴다. 파이프라인 탭이 `saveAutomaticScout.bind(null, slug)`를 넘기는 방식과 같다(`src/app/(app)/p/[slug]/pipeline/page.tsx:34`).
- **문구.** product-copy §5에 아래 줄을 잠금 블록으로 더한다. `{}`는 값이다. 영어 문장은 2026-10-20 검토 요청 6에서 이대로 확인받았다. 구현 중에 바꾸면 이 문서와 product-copy를 함께 고친다.

| 상태 | 큰 배너 줄 |
| --- | --- |
| session·idle | `Runner: watching in Claude Code on {host} · checked {n} min ago` |
| resident·idle | `Runner: running in the background on {host} ({branch}) · checked {n} min ago` |
| session·working | `Runner: working in Claude Code on {host} · last activity {n} min ago` |
| resident·working | `Runner: working in the background on {host} ({branch}) · checked {n} min ago` |
| waiting·dirty | `Runner on {host} is waiting: commit or stash the changes on {branch}, and it continues.` |
| waiting·branch | `Runner on {host} is waiting: switch back to {branch}, and it continues.` |
| 일시 정지 | `Runner paused — it starts nothing new. Work already running finishes first.`(state가 `working`이 아니면 뒤 문장 없음) |
| 응답 없음 | `No signal from the runner on {host} for {n} min.` |
| 정지 | `Runner on {host} stopped: {reason}. Start it again in Claude Code.` |
| 자동 시작 켜짐 | 줄 끝에 ` · starts at sign-in` |
| 허용 목록만(`permission=allowlist`) | 줄 끝에 ` · allow-list only` |
| 없음(추가 한 줄) | `Runners on plugin 0.5.13 or later show their status here.` |
| 없음·Free(추가 한 줄, Phase B부터) | `The background runner opens on Pro.` |

**스트립(한 줄) 꼬리와 프로젝트 목록 카드 줄**은 같은 짧은 형태를 쓴다. 스트립은 기존 문장 뒤에 ` · `로 붙이고, 목록 카드는 기존 `open item`·`open agent run` 줄(product-copy §10 `:593-594`) 다음 줄에 둔다.

| 상태 | 짧은 형태 |
| --- | --- |
| session·idle | `Runner: watching on {host}` |
| resident·idle | `Runner: running on {host}` |
| working | `Runner: working on {host}` |
| waiting | `Runner: waiting on {host}` |
| 일시 정지 | `Runner: paused` |
| 응답 없음 | `Runner: no signal from {host}` |
| 정지 | `Runner: stopped on {host}` |
| 없음 | (붙이지 않는다) |

**정지 이유 `{reason}`**은 코드별 고정 문장이다.

| 코드 | 문장 |
| --- | --- |
| `stuck` | `the same steps came back three times without progress` |
| `error` | `it hit an error — check the session or its log` |
| `plan` | `the background runner needs Pro` |

- 버튼은 **Pause** / **Resume**(§1 "Buttons are verbs").
- 서버나 CLI가 보낸 자유 문장은 화면에 싣지 않는다.
- `{host}`·`{branch}`는 경로·키와 같은 식별자이므로 monospace로 그린다(product-copy §1 "Identifiers the machine made … render in the monospace face").
- 무엇을 하고 있는지는 실행기 줄에 다시 적지 않는다. 바로 위 배너의 세부 줄("dev is implementing ITEM-01")이 말한다.
- Free 줄은 "창 없는 실행"이 아니라 "background runner"가 Pro에서 열린다고 말한다. Free에서도 `claude --bg`로 창 없이 돌릴 수는 있기 때문이다([Pro가 주는 것](#pro가-주는-것과-새는-곳)).

### Phase B — 상주 실행기

#### B-1. 진입점

- **CLI.** `plugin/bin/harness-background.mjs`. 오래 사는 프로세스라서, 한 줄 JSON을 내고 끝나는 1단계 watch CLI의 계약과 섞지 않는다. 설계 문서의 `--spawn` 모드 대신 별도 진입점을 둔다. 잠금·세션 코드는 `plugin/runtime/local-session.mjs`를 같이 쓴다.
- **Windows 런처.** `plugin/bin/harness.ps1`의 `ValidateSet`(`:2`)과 진입점 표에 `background`를 더한다.
- **스킬.** `plugin/skills/background/SKILL.md`(`/harness:background`)에 `start`, `stop`, `status`, `autostart on|off`를 둔다.
  - `start`는 1단계처럼 preflight를 거친다(런처, 토큰, 서버, 검증 스킬). 새 일을 시작할지 한 번 묻는다(기본 no).
  - **시작 검사.** 작업 트리에 커밋되지 않은 변경이 있으면 시작을 거부한다(smoke 결정 6). 지금 브랜치를 고정 브랜치로 기록한다. 자동 시작은 등록 때 기록한 브랜치와 지금 브랜치가 다르면 거부한다. 시작한 뒤의 미커밋 변경·브랜치 변경은 거부가 아니라 대기다(결정 11, B-2).
  - 그다음 창과 분리된 프로세스를 띄우고 PC, 저장소, 브랜치, 로그 위치, 끄는 방법을 보여 준다.
  - lease 시작은 `start`(mode `resident`, `branch`, `permission`)이고, 결과를 A-4의 "lease 기록"과 같이 로컬 잠금의 `runnerLease`에 남긴다. 상주 실행기는 404 서버에서 시작하지 않는다(표시 없이 무인으로 도는 것을 막는다).
- **로컬 잠금.** `mode: "resident"`를 더한다. `readState`의 허용 값(`local-session.mjs:72`)을 넓힌다. 옛 판 플러그인은 이 값을 손상 상태로 보고 거부한다. 같은 저장소에서 옛 판과 섞여 도는 것을 막으므로 의도한 동작이다.
  - 상주 프로세스는 자기를 `poller`로, 띄운 `claude -p`를 `children`으로 잠금에 등록한다(`registerChild`·`settleChild`, `local-session.mjs:180-200`).
  - 로컬 `--stop`이 `lifecycle: "stopping"`을 쓰면, 상주 프로세스가 다음 확인에서 그것을 보고 새 실행을 멈춘다. 진행 중인 자식이 끝나면 정리(`settleChild`)하고, `poller`를 비운 뒤 스스로 `--release`와 같은 해제를 하고 끝낸다.
  - 해제는 지금처럼 `stopping`·`poller` 없음·`children` 없음을 요구한다(`releaseSession`, `local-session.mjs:166-178`).
- **watch 스킬의 `--once` 갈래**는 `--check` 결과로 `mode:resident`를 요구한다. 1단계 무장 갈래는 지금처럼 `mode:watch`를 요구한다(`SKILL.md:83`).

#### B-2. 한 사이클

1. 60초마다 `beat` → `pipeline_next`(propose 정책 적용, `actionableWork` 재사용). 이 `beat`는 지금 상태를 싣는다. 대기 중이면 대기 조건이 풀릴 때까지 `waiting`(같은 `waitReason`)을, 아니면 `idle`을 보낸다. 상태가 매분 바뀌어 배너가 흔들리거나 쓰기가 늘지 않게 하려는 것이다.
2. 할 일이 있고 일시 정지가 아니면 **실행 직전 검사**를 한다.
   - `git status --porcelain`이 비어 있는지 본다. 무시된 파일은 제외하고, 추적되지 않은 파일은 포함한다.
   - `git rev-parse --abbrev-ref HEAD`가 시작 브랜치와 같은지 본다.
   - 실패하면 `beat`(state `waiting`, waitReason)를 보내고 Windows 알림을 한 번 띄운 뒤 1로 돌아간다. 같은 대기가 이어지는 동안에는 알림을 다시 띄우지 않는다.
3. `claude -p`를 띄운다(B-3). 도는 동안 부모 프로세스는 60초마다 `beat`(state `working`)를 보낸다.
4. 끝나면 결과를 판정하고 `beat`(state `idle`, lastResult, lastLog)를 보낸 뒤 1로 돌아간다.

- **진전 판정.** 실행 앞뒤의 작업 서명(`workSignature`)이 같으면 진전 없음이다.
- **실패 상한.** 비정상 종료, 시간 초과, 진전 없음을 실패로 센다. 3회 연속이면 `stop`(reason `stuck`)을 보내고 알림을 띄운 뒤 종료한다. 진전이 있으면 횟수를 0으로 되돌린다.
- **시간 상한.** 기본 2시간이다. 넘으면 프로세스 트리를 끝낸다. Windows에서는 손자 프로세스까지 끝내야 하므로 `taskkill /T /F`를 쓴다.
- **멈춤 요청.** `stop:"plan"`, `RUNNER_REPLACED`, 로컬 `--stop`을 받으면 진행 중인 실행을 끝까지 두고 새 실행을 시작하지 않는다. 그 실행이 끝나면 종료한다.
- **실행 중 404.** 상주 프로세스의 `beat`가 404를 받으면(서버 롤백) 멈춤 요청과 같이 처리한다. B-1이 404 서버에서 시작하지 않는 것과 같은 이유로, 표시 없이 무인으로 계속 돌지 않게 한다. 서버에 보낼 곳이 없으므로 로그와 Windows 알림으로만 알린다. 자식 `claude -p` 안의 `--check`는 A-4대로 그 호출만 건너뛰므로 진행 중인 실행은 끝까지 간다.

#### B-3. `claude -p` 호출

```text
claude -p "/harness:watch --once --session <id>" \
  --permission-mode auto \
  --settings <git-common-dir>/harness/background-settings.json \
  --disallowedTools "Bash(git push:*)" "PowerShell(git push*)" \
  --output-format stream-json --verbose
  [--max-budget-usd <n>]   # 사용자가 켰을 때만
```

- **실행 규칙은 한 곳에서 가져온다.** watch 스킬에 `--once` 갈래를 더한다. 무장·대기·CLI 폴링은 하지 않고, fresh overview의 일을 런북대로 끝까지 처리한 뒤 끝낸다.
  - 디스패치, 인수, 핸드오프, 게이트 대기, 소유권 확인 규칙은 1단계 §4·§5를 그대로 쓴다.
  - 커밋 정책은 로컬 세션 정책(`watch.json`의 `commit`)을 시작 때 `true`로 고정한다. 서버 lease에는 커밋 정책이 없다.
- **허용 목록**(`background-settings.json`)에 들어가는 것:
  - `mcp__harness__*`
  - `git status`·`diff`·`log`·`add`·`commit`
  - `harness.json` 워크스페이스의 `verify` 명령들
  - 번들 런처
  
  목록 밖은 auto 분류기가 판정한다. headless는 미신뢰 작업 공간의 project permissions를 무시하므로 `--settings`로 넘긴다.
- **push 차단의 한계.** `--disallowedTools`는 접두어 규칙이라 `git -C <dir> push` 같은 변형을 못 막는다. 그 경우는 auto 분류기와 런북의 push 금지 계약("Pushing is the owner's job")이 다음 방어선이다. 이 한계를 잔여 위험에 적는다.
- **auto를 쓸 수 없는 계정.** 시작할 때 짧은 preflight 실행으로 실제 권한 모드를 확인한다(stream-json 첫 `system`/`init` 메시지). auto가 아니면 `--permission-mode dontAsk` + 같은 허용 목록으로 바꾸고 lease `start`의 `permission`을 `allowlist`로 보낸다(A-3). 배너에는 ` · allow-list only`를 덧붙인다(A-5).
- **로그.** `<git-common-dir>/harness/runs/<UTC시각>.jsonl`에 stream-json을 그대로 쓰고, 같은 이름의 `.meta.json`에 종료 코드·시간·결과 종류·권한 거부 수를 쓴다. 최근 50개만 남긴다.
  - 작업 트리 밖이라 실행 직전 검사에 걸리지 않는다.
  - 서버에는 결과 한 줄(`lastResult`)과 파일 이름(`lastLog`)만 올린다.

#### B-4. Windows 알림과 자동 시작

- **알림.** `plugin/runtime/windows/notify.ps1`이 Windows PowerShell 5.1의 WinRT 토스트를 띄운다.
  - 실패하면 로그에만 남기고 실행기는 계속 돈다.
  - 띄우는 경우: 정지(owner 제외), 대기 시작, 교체됨, 플랜 정지, 실행 중 404(B-2), 자동 시작 거부.
- **자동 시작.** `autostart on`은 로그온 때 `harness.ps1 background --start …`를 숨긴 창으로 실행하도록 등록한다. `autostart off`는 등록을 지운다.
  - 시작 검사(작업 트리, 브랜치, lease, 플랜)는 수동 시작과 같다(B-1). 실패하면 Windows 알림을 띄우고 이유를 로그에 남긴다.
  - lease를 얻기 전에 거부된 시작은 서버에 행이 생기지 않아 웹에는 보이지 않는다(BUSY·플랜 거절도 마찬가지). 이 한계는 잔여 위험에 적는다.
  - 자동 시작에는 사용자 토큰(hu_)이 사용자 환경 변수에 저장돼 있어야 한다. 프로젝트 토큰(hs_)은 터미널마다 설정하는 값이라 로그온 때 읽을 수 없다(product-copy §15의 토큰 안내). 스킬이 이를 확인하고, 없으면 켜기를 거절한다.
- **등록 방식.** 작업 스케줄러를 쓴다(결정 17). 관리자 권한 없이 사용자 범위의 로그온 작업을 만들 수 있는지는 확인하지 못했다. Phase B 첫 단계에서 실측하고, 안 되면 시작 프로그램 폴더 바로가기로 바꾼다. 어느 쪽이든 동작은 같다(사용자 로그온 때 실행).

#### B-5. Pro 차이 표시

Phase B 출시와 함께 Pro 차이를 두 곳에 보인다. Phase A에는 Pro만 쓸 수 있는 기능이 아직 없어서 보이지 않는다.

- **`/billing` 플랜 표.** `src/fsd/pages/billing/model/plan-matrix.ts`의 `planMatrix` 끝에 `{ label: "Background runner", values: cell((p) => (limitsFor(p).residentRunner ? "Yes" : "—")) }`를 더한다. 값은 A-3에서 더한 `LIMITS`의 `residentRunner`에서 읽는다. `plan-matrix.test.ts`에 이 행의 값 `{ free: "—", pro: "Yes", max: "Yes" }`를 고정하는 사례를 더한다.
- **배너의 Free 줄.** A-5 표의 "없음·Free" 줄(`The background runner opens on Pro.`)과, 그 줄을 위해 레이아웃이 넘기는 `plan` prop을 이때 더한다. product-copy §5의 실행기 잠금 블록에도 이때 그 줄을 더한다.
- **공개 문서는 바꾸지 않는다**(`src/fsd/pages/docs/`, 검토 요청 7).

## 검토 요청

결정 18개 위에서 이 문서가 새로 정한 것이다. 2026-10-20 사용자가 일곱 개 모두 아래대로 확인했다.

1. **REST(`/api/runner`)로 둔다, MCP 도구가 아니라.** MCP 도구는 모든 에이전트 모델의 도구 목록에 보이기 때문이다(A-3).
2. **응답 없음 기준: 3분, 1단계 작업 중에만 "마지막 신호·마지막 에이전트 활동 중 늦은 쪽 뒤 60분"**(A-2). 1단계는 작업 중에 신호를 보낼 프로세스가 없어서, 서버가 이미 계산하는 에이전트 활동을 함께 본다.
3. **정지 표시는 다음 시작까지 남긴다.** 소유자가 직접 멈춘 경우만 지운다(A-1 표).
4. **서버에 닿지 않을 때 `--check`는 통과시킨다**(A-4). 일시 정지 확인만 놓치는 대가로, 네트워크 오류가 세션을 멈추지 않게 한다.
5. **Phase B는 별도 CLI(`harness-background.mjs`)와 watch 스킬의 `--once` 갈래로 만든다**(B-1, B-3). 설계 문서의 `harness-watch.mjs --spawn`과도, `claude --bg`와도 다르다([대안 검토](#대안-검토)).
6. **이름과 문구:** 화면 낱말 "runner", 스킬 `/harness:background`, 테이블 `Runner`, 서버 모듈 `runners`. A-3(§12)·A-4(§15)·A-5(§5·§10)의 영어 문장들.
7. **Pro 차이는 `/billing`에만 보인다.** `/billing`의 플랜 표(`src/fsd/pages/billing/model/plan-matrix.ts:24-26`)는 플랜 차이를 줄마다 그린다. Phase B 출시 때 그 표에 "Background runner" 행(Free "—", Pro·Max "Yes")을 더한다(B-5).
   - 공개 문서(`src/fsd/pages/docs/`)에는 더하지 않는다. product-copy §20은 공개 문서에서 하지 않는 주장으로 "fully unattended execution"과 "Windows support"를 정해 두었다(`docs/conventions/product-copy.md:1447-1448`). Pro는 게이트를 지울 수 있어서, background runner를 소개하면 두 주장에 바로 걸린다.
   - 공개 문서 반영은 Phase B 실측 뒤에 따로 정한다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `prisma/schema.prisma`, `prisma/migrations/<ts>_runner/` | add | A-1. 추가형 | medium — 공유 Neon 적용이 곧 운영 반영 |
| `packages/core/runner.mjs`(+test), `plugin/lib/runner.mjs`(생성 사본) | add | A-2 순수 판정. 서버·웹 공유. core의 모든 `.mjs`는 `sync:plugin-lib`가 복사하고 `npm run check`가 어긋남을 잡는다(`scripts/plugin-lib.mjs`) | low |
| `packages/core/entitlement.mjs`, `plugin/lib/entitlement.mjs`(생성 사본) | update | `residentRunner` 플래그·문장 | low — `sync:plugin-lib`로 사본 갱신 |
| `src/server/runners/runner-service.ts`, `api.ts`, `api.server.ts`, `contracts.ts` | add | A-3 lease·일시 정지·조회 | medium — 잠금 순서·동시 시작 |
| `tests/server/integration/runner-lease.test.ts` | add | 동시 `start`·재전송·교체·만료·일시 정지·잠금 변이 | low |
| `src/server/rest/runner-handler.ts`(+`runner-handler.test.ts`), `src/server/rest/runner.ts`, `src/server/rest/api.server.ts`, `src/server/rest/api.ts` | add/update | A-3 REST 판정·바인딩·응답 | medium — 인증 경계 |
| `src/app/api/runner/route.ts` | add | 배선만 | low |
| `scripts/verify-server-boundaries.mjs`(`directions`·`runtimeAssembly`), `docs/architecture/server.md`(`:12-22`·`:43`·`:54-75`) | update | 새 모듈·조립부·공개 symbol | low |
| `src/fsd/widgets/turn-banner/model/runner.ts`(+`runner.test.ts`), `ui/runner-line.tsx`, `api/turn-data.server.ts`, `api/turn-data.test.ts`, `ui/turn-banner.tsx`, `ui/turn-banner.test.ts`, `ui/next-step.tsx`, `ui/next-step.test.mjs`, `index.ts` | add/update(A·B) | A: A-5. B: Free 줄(B-5) | medium — 잠금 문구·탭별 렌더·hydration |
| `src/fsd/features/pause-runner/api/pause-runner.server.ts`, `ui/pause-runner-button.tsx`, `index.ts`, `index.server.ts` | add | 일시 정지 Action·버튼 | low |
| `src/app/(app)/p/[slug]/layout.tsx` | update(A·B) | A: `runner`·`pause`를 `TurnBanner`에. B: `plan`(B-5) | low |
| `src/fsd/pages/billing/model/plan-matrix.ts`(+`plan-matrix.test.ts`) | update(B) | B-5 "Background runner" 행 | low |
| `src/fsd/pages/project-list/api/project-list.server.ts`, `ui/project-list-page.tsx`, `ui/project-list-page.test.mjs`, `model/project-list-copy.ts`, `model/project-list-copy.test.ts` | update | 목록 카드 한 줄. `availability-service.ts`는 바꾸지 않는다 | low |
| `tests/server/fixtures/src-clean-code-browser.tsx` | keep | 새 prop이 선택이라 그대로 렌더된다(`:219`) | low |
| `plugin/bin/harness-watch.mjs`(+`harness-watch.test.mjs` fixture 라우팅), `plugin/bin/harness-session.mjs`(+`harness-session.test.mjs`), `plugin/runtime/runner-client.mjs`(add) | update | A-4 | medium — 이벤트 계약 변경 |
| `plugin/runtime/local-session.mjs` | update(A·B) | A: `readState`가 `runnerLease`(boolean)를 검사. B: `mode: "resident"` | medium — B의 새 mode는 옛 판이 손상 상태로 봄(의도) |
| `plugin/skills/watch/SKILL.md` | update | A-4 스킬 규칙, B-3 `--once` | medium |
| `plugin/.claude-plugin/plugin.json` | update | 판 상승(A, B 각각) | low |
| `plugin/bin/harness-background.mjs`, `plugin/runtime/background.mjs`, `plugin/runtime/windows/notify.ps1`·`autostart.ps1`, `plugin/skills/background/SKILL.md`, `plugin/bin/harness.ps1`(+test) | add/update | Phase B | high — 무인 실행·프로세스 수명 |
| `docs/architecture/protocol.md` | update | `:118-121`(다섯 REST 경로·요청 제한), `:163-167`(감시가 DB를 바꾸지 않는다는 문장), `:188`(로컬 잠금 한계 옆 서버 lease), 새 runner 절. Phase B: `:469-476`(로컬 상태 `mode`에 `resident`) | low |
| `docs/conventions/product-copy.md` | update | §5 실행기 줄·짧은 형태·정지 이유, §10 목록 카드(`:593-594`), §12 거절 사유, §15 watch 이벤트·문구(Phase B: background 스킬, §5 Free 줄). §20은 바꾸지 않는다(검토 요청 7) | medium — 다른 브랜치 WIP와 같은 파일 |
| `docs/architecture/verification.md` | update | 잠금 표(`:319-333`)에 새 블록 행 | low |
| `CONTEXT.md` | update | 실행기(Runner) 용어 | low |
| `docs/test-reports/active/2026-10-02-local-watch-executor.md` | update | Phase A·B 실측 기록 | low |

## Safety Analysis

확인한 항목:

- [x] **앱 진입점과 라우팅.** 새 route 하나(`/api/runner`). 기존 route는 그대로 두고, 프로젝트 레이아웃은 Action을 넘기는 것만 바뀐다.
- [x] **정적 import와 경계.** 새 서버 모듈의 방향은 `runners → projects`, `rest → runners`, FSD api segment → `runners/api.server.ts`다. 검사기 표와 server.md를 같이 고친다.
- [ ] **dynamic import.** 해당 없음(새 dynamic import 없음).
- [x] **barrel export.** `turn-banner`·`pause-runner` slice의 `index.ts`·`index.server.ts`만 넓힌다. 서버 모듈은 `export *` 금지 규칙을 따른다.
- [x] **테스트와 스크립트 참조.** `tools.test.mjs`의 도구 목록은 바뀌지 않는다(MCP 도구를 더하지 않음). 문구 잠금 시험에 새 블록이 등록된다.
- [ ] **정적 자산.** 해당 없음.
- [x] **런타임 side effect.**
  - 서버: 신호마다 조건부 DB 쓰기가 있다.
  - 플러그인: Phase B는 오래 사는 프로세스, 자식 프로세스, 작업 스케줄러 등록, 토스트를 만든다. 모두 사용자가 켜야 생긴다.
- [x] **API·외부 영향.**
  - REST 계약이 하나 늘고, 요청 제한 구간에 함께 센다.
  - 옛 플러그인은 바뀌지 않고, 서버는 신호가 없는 실행기를 문제로 보지 않는다.
  - 새 플러그인의 1단계 watch는 404를 받으면 로컬 잠금만으로 돈다(A-4). 상주 실행기는 404 서버에서 시작하지 않고, 실행 중에 404를 받으면 진행 중인 실행을 끝낸 뒤 멈춘다(B-1, B-2).

**바뀌지 않는 것.**
- 게이트, 보류, 인수, 작업 도구(`agent_next` 등)의 동작
- 대화 세션의 직접 진행. lease는 실행기끼리만 막는다.
- 런북과 템플릿
- 1단계의 커밋 질문, push 금지, 같은 저장소 로컬 잠금

**제품 경계.** 서비스는 상태와 일시 정지 플래그만 저장한다. Claude를 실행하는 것은 여전히 사용자 PC의 사용자 계정이다(`docs/architecture/system-overview.md` 제품 경계).

## Approval

승인 메모:

- 승인 전.
- 검토 요청 7개는 2026-10-20 사용자가 확인했다. 7은 `/billing`만으로 범위를 좁혀 확인했다.
- 운영 마이그레이션, 운영 배포(main 승격), 플러그인 marketplace 갱신은 각각 실행 직전에 따로 확인받는다.

## Execution Plan

**Phase A**
1. dev에서 `harness/runner-status` worktree를 딴다. node_modules를 정션으로 연결했으면 `npm run db:generate`를 먼저 돌린다(생성 클라이언트 `src/generated`는 추적되지 않는다). 아래 Verification Plan의 명령을 바꾸기 전 기준선으로 한 번 돌려 결과를 적어 둔다.
2. `packages/core/runner.mjs`·`entitlement.mjs` 플래그와 시험, `npm run sync:plugin-lib`.
3. 마이그레이션과 `src/server/runners/`(A-3 표). 통합 시험 `tests/server/integration/runner-lease.test.ts`를 함께 쓴다. 다룰 것: 동시 `start` 두 건 중 하나만 성공, 같은 세션 재전송, 교체, 만료, 일시 정지 멱등, 잠금을 뺀 변이에서 시험이 실패하는지.
4. REST: `rest/runner-handler.ts`(+시험)·`rest/runner.ts`·`api.server.ts`·`api.ts`, `src/app/api/runner/route.ts`, 검사기 `directions`·`runtimeAssembly`, server.md(A-3의 경계 갱신).
5. 웹: `loadTurn` 읽기 → `model/runner.ts` → 큰 배너·스트립·`WATCH_LINE` 조건, `pause-runner` slice, 레이아웃, 프로젝트 목록 adapter와 카드, product-copy §5·§10·§12와 잠금 시험·`verification.md` 잠금 표(`:319-333`).
6. 플러그인: `plugin/runtime/runner-client.mjs`, watch·session CLI 변경과 시험, watch 스킬, product-copy §15, 판 상승.
   - `harness-watch.test.mjs`의 가짜 서버(`:45-56`)는 지금 URL과 상관없이 모든 요청을 MCP로 처리한다. `/api/runner` 요청은 따로 기록하고 기본 404로 답하도록 고친다. 그러면 기존 시험의 MCP 호출 수·URL 단언(`:134-141` 등)은 바뀌지 않아야 한다. 새 동작은 새 사례로 검사한다.
   - `harness-session.test.mjs`의 가짜 서버는 Codex 역할 bridge 시험용이고 CLI `--check`를 HTTP로 거치지 않는다. CLI `--check`·`--release`의 runner 호출은 새 사례(가짜 `/api/runner`)로 검사한다.
7. 문서: protocol(`:118-121` REST 수·요청 제한, `:163-167` 감시가 DB를 바꾸지 않는다는 문장, `:188` 로컬 잠금 한계 옆 서버 lease), CONTEXT.md.
8. PR → dev. 머지 뒤 localhost smoke A(아래)를 한다.
9. 운영: `migrate status` → 리허설(ROLLBACK) → `migrate deploy` → main 빨리 감기 → 배포 확인 → Windows 번들 재패키징 → marketplace 갱신. 단계마다 확인을 받는다.
   - 번들 생성기는 `git ls-files -- plugin`의 **추적된** 파일만 담는다(`scripts/package-windows-plugin.mjs:32`). 새 파일(`runtime/runner-client.mjs` 등)은 커밋된 상태에서 패키징한다.
   - 산출 목록에 그 파일이 있는지 확인한다.

**Phase B** (A 출시 뒤)
1. 실측 spike: `claude -p "/harness:watch --once …"`의 스킬 호출, stream-json의 init 권한 모드·결과 필드, PowerShell 도구 거부 규칙의 문법(`PowerShell(git push*)`가 실제로 막는지), `-p`가 커밋 전에 묻지 않는지, Claude Code 세션에서 띄운 분리 프로세스의 수명, 상주 프로세스가 죽을 때 `claude -p` 자식과 손자 프로세스가 함께 끝나는지(Windows Job Object 등), 관리자 권한 없는 로그온 작업 등록, PowerShell 토스트. 결과를 테스트 보고서에 기록하고 B-3·B-4의 열린 부분을 확정한다.
2. `harness-background.mjs`·`background.mjs`, 로컬 잠금 `resident`, 가짜 `claude` 실행 파일로 하는 시험을 만든다(대기·재개, 실패 3회, 시간 초과, 일시 정지, 교체, 플랜 정지, 실행 중 404, 로그 50개).
3. watch 스킬 `--once` 갈래, background 스킬, `harness.ps1`, 알림·자동 시작 스크립트, product-copy §15를 만든다.
4. B-5: `/billing` 행과 시험, 배너 Free 줄과 `plan` prop(레이아웃), product-copy §5 잠금 블록의 Free 줄과 렌더 사례.
5. PR → dev → localhost smoke B → 운영 승격·번들 갱신(각각 확인).

## Verification Plan

실행할 검증:

```bash
npm run db:generate      # 새 worktree에서 한 번(정션 node_modules)
npm run check
npm test
npm run test:web
npm run test:server
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:<port>/stagekeeper_test_<name>" npm run test:server:integration
```

- `test:server:integration`은 `DATABASE_URL`과 다른 로컬 PostgreSQL의 `stagekeeper_test_*` 데이터베이스가 필요하다(`scripts/test-server-integration.mjs`의 `validateTestDatabase`). 포터블 PG18로 새 클러스터를 만들어(`initdb` → `pg_ctl start` → `createdb`) 쓴다. 공유 Neon은 쓰지 않는다. 이 스크립트는 연결 문자열이 새지 않게 시험 수를 출력하지 않고 통과·실패 한 줄만 낸다.
- `npm run build`는 PR의 CI `check (build)` 작업으로 확인한다. 정션 node_modules worktree에서는 Turbopack이 build를 거부한 적이 있고, 같은 node_modules를 쓰는 본 checkout의 dev 서버에 영향을 줄 수 있어 로컬에서 돌리지 않는다. 로컬에서 꼭 돌려야 하면 `npm ci`를 한 별도 worktree에서 한다.

검증 기준:

- **단위.**
  - `runner.mjs`: mode·state별 경계 시각, 1단계 작업 중에 마지막 에이전트 활동이 신호보다 늦은 경우(60분 경계), 만료 뒤 넘겨받기, 명시적 교체
  - entitlement 플래그와 `RESIDENT_RUNNER_PLAN_GATE`
  - handler(`rest/runner-handler.test.ts`):
    - 인증 갈래(hs_·hu_·ho_ 거절·만료), hu_ project 누락, 남의 프로젝트, 선택되지 않은 프로젝트
    - 요청 제한(429 본문과 `Retry-After`), 본문 검사 400
    - Free resident 거절, `RUNNER_BUSY`(holder 포함), `RUNNER_REPLACED`, `stop:"plan"`
    - 같은 세션 `start` 재전송 성공, 없는 행 `stop` 성공, 없는 행 `beat` 거절
    - `state` 없는 `beat`의 상태 유지, 쓰기 생략 조건
  - 배너 모델(`model/runner.test.ts`): 상태별 줄·짧은 형태, 일시 정지, 정지 이유 고정 문장, 자유 문장 차단, `renderedAt` 기준 계산, 브라우저 시계가 앞서거나 늦어도 시계 차이 보정 뒤 같은 판정
  - 배너 렌더(`ui/turn-banner.test.ts`·`ui/next-step.test.mjs`에 사례 추가):
    - 살아 있는 실행기면 `WATCH_LINE`이 없다. 응답 없음·정지·없음이면 있다.
    - 버전 줄. Phase A에는 Free 플랜이어도 Free 줄이 없다
    - Phase B: `plan`이 Free일 때만 Free 줄
    - Board·Inbox에만 버튼, 나머지 탭은 짧은 형태
    - 새 prop 없이 그린 기존 사례는 그대로 통과
  - `turn-data.test.ts`: 새 import·조회 가짜와 `runner: null`
  - 프로젝트 목록: 카드 줄(`project-list-copy.test.ts`), adapter가 요약을 붙이는지(`project-list-page.test.mjs`)
  - Phase B `/billing`: `plan-matrix.test.ts`의 "Background runner" 행 값
  - 잠금 문구: 새 블록의 글자 일치와 렌더 포함, `verification.md` 잠금 표의 새 행
  - 경계: `npm run check` 안의 `verify:fsd`·`verify:server`가 새 import를 통과(위젯 model/ui가 `@/server`를 import하지 않음)
- **통합.** 격리 PG에서 확인한다.
  - 동시 `start` 두 건이 경합하면 한 건만 lease를 얻는다. 잠금 뒤 읽기를 실측한다. 변이 확인으로, 잠금을 빼면 시험이 실패하는지 본다.
  - 만료 판정은 DB 시계 기준이다. `seenAt`을 `clock_timestamp()`보다 3분 넘게 이전으로 둔 행은 `takeover` 없이 넘겨받힌다.
  - `stopped` 행은 lease를 잡지 않는다.
  - 일시 정지는 멱등이다.
- **플러그인.** 가짜 HTTP 서버로 확인한다(`/api/runner`를 따로 받도록 고친 fixture).
  - `start`가 `RUNNER_BUSY`이면 로컬 잠금을 지우고 `busy` 이벤트(exit 0)를 낸다. `--takeover`는 `--start` 없이 거절된다.
  - `start`의 일시적 실패 뒤 같은 세션으로 다시 보낸다.
  - `paused`이면 `work`를 내지 않고, 여러 번 폴링해도 `stuck`이 되지 않는다(반복 상태가 그대로).
  - `start`가 404면 잠금에 `runnerLease: false`를 쓰고 로컬 잠금만으로 계속 돈다. 이후 poll·`--check`·`--release`는 `/api/runner`를 부르지 않는다. `runnerLease: true` 세션의 poll·`--check`가 404를 받으면 그 호출만 건너뛰고 계속 돈다. `runnerLease`가 boolean이 아니면 `corrupt-state`다.
  - `--check`는 `mode: "watch"` 세션에서 `state` 없이 `beat`를 보내고 `paused`를 싣는다. 서버에 닿지 않으면 `server:"unreachable"`, 404면 두 필드 없이, lease를 잃었으면 `replaced`를 낸다.
  - `mode: "foreground"`(Codex 포함) 세션의 `--check`·`--release`는 `/api/runner`를 한 번도 부르지 않는다. Codex 역할 bridge 시험은 그대로 통과한다.
  - `--release`: 서버 실패와 무관하게 로컬을 해제한다.
  - poll이 `stuck`·`error`로 끝나면 `stop`을 보내고, 그 요청이 실패해도 원래 이벤트와 종료 코드는 그대로다.
  - 기존 watch 시험은 모두 그대로 통과한다.
- **smoke A(localhost, harness-watch-smoke).**
  1. `/harness:watch`를 시작하면 Board 배너에 "watching in Claude Code on <PC>"가 뜬다.
  2. 두 번째 clone의 watch는 `busy`를 받는다.
  3. Pause를 누르면 새 디스패치가 시작되지 않고, Resume을 누르면 이어 간다.
  4. 대기(무장) 중에 창을 닫으면 3분 뒤 "No signal"이 뜬다(작업 중에 닫으면 마지막 활동 뒤 60분).
  5. 프로젝트 목록 카드에 한 줄이 뜬다.
- **smoke B(localhost).** 상주 실행기를 시작하고 다음을 확인한다.
  1. 웹 승인 → 실행 → 인수까지 사람 개입 없이 간다.
  2. 미커밋 파일을 두면 대기와 알림이 생기고, 파일을 지우면 재개한다.
  3. Pause를 누르면 진행 중인 실행이 끝난 뒤 멈춘다.
  4. 로컬 stop이 동작한다.
  5. 자동 시작을 켜고 다시 로그온하면 시작된다.
  6. Free 거절은 smoke가 아니라 handler 시험(`rest/runner-handler.test.ts`)과 통합 시험으로 확인한다. smoke 계정은 Max이고, 확인을 위해 실제 계정의 플랜을 바꾸지 않는다.
  7. 로그 파일과 결과 한 줄이 남는다.
  8. push가 일어나지 않는다.
- **기존 실패와 신규 실패 구분.** 시작 전에 dev 기준선의 같은 명령 결과를 기록하고, 실패 파일과 개수를 비교한다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| 기준선(dev `5695d88`, 2026-10-20, 정션 worktree + `db:generate`) `npm run check` | pass | 아키텍처·가용성 시험 18/18 |
| 기준선 `npm test` | pass | 400/402, 건너뜀 2 |
| 기준선 `npm run test:web` | pass | 664/664 |
| 기준선 `npm run test:server` | pass | 138/139, 건너뜀 1 |
| 기준선 `npm run test:server:integration` | pass | 로컬 포터블 PG18 `stagekeeper_test_*`. 스크립트가 수를 출력하지 않음 |
| 구현 뒤 전체 | Not run yet | 구현 전 |

## Risks and Rollback

잔여 리스크:

- **1단계 작업 중의 생존 판정은 거칠다.** 세션이 일하는 동안에는 디스패치마다 하는 `--check`와 에이전트 활동에서만 신호를 얻는다. 창을 닫은 뒤 최대 60분 동안 "작업 중"으로 보일 수 있다. 같은 프로젝트에서 다른 세션이 일하면 더 길어진다. 화면은 "last activity N min ago"를 함께 보여서 이 한계를 숨기지 않는다.
- **Pro 전용은 background 실행기에만 걸린다.** Free 사용자도 `claude --bg` + `/harness:watch`로 창 없이 돌릴 수 있다([Pro가 주는 것](#pro가-주는-것과-새는-곳)). 문구는 "background runner"가 Pro에서 열린다고만 말한다.
- **`claude --bg` 판단은 문서 일부에 근거한다.** agent-view 문서 앞 10만 자만 읽었고, 커밋 전 질문과 놀 때 멈추는 동작을 실측하지는 않았다. 이 동작이 바뀌거나 문서 뒷부분에 예외가 있으면 대안 1을 다시 본다.
- **옛 플러그인은 보이지 않고 lease에도 걸리지 않는다**(결정 9). 옛 판과 새 판이 다른 PC에서 동시에 돌면 막지 못한다. 서버의 receipt·stale 검사가 이중 처리만 막는다.
- **push 차단은 접두어 규칙이다.** `git -C … push` 같은 변형은 auto 분류기와 런북 계약에 맡긴다.
- **Phase B의 Claude Code·Windows 동작은 실측 전이다.** 확인할 것은 Execution Plan Phase B 1단계 목록이다(`-p`에서 스킬 호출, init 권한 모드, PowerShell 거부 규칙, `-p`의 커밋 전 질문 여부, 분리 프로세스 수명, 자식 정리, 관리자 권한 없는 로그온 작업, 토스트). Phase B 1단계 spike가 실패하면 그 부분의 설계를 고쳐 다시 승인받는다.
- **다른 브랜치 WIP와 같은 파일을 고친다.** 본 checkout의 `harness/pipeline-tab-redesign` 미커밋 작업이 `docs/conventions/product-copy.md`를 고치고 있다. 먼저 머지되는 쪽 뒤에 다른 쪽이 충돌을 해결해야 한다. 그 작업이 고치는 `availability-service.ts`는 이 문서가 건드리지 않도록 목록 데이터를 adapter에서 합쳤다(A-5).
- **lease를 얻기 전의 거부는 웹에 보이지 않는다.** 자동 시작의 미커밋 변경·브랜치 거부와 BUSY·플랜 거절은 서버에 행을 만들지 않는다. 사용자는 Windows 알림과 로그로만 안다.
- **상주 프로세스가 죽으면 자식이 남을 수 있다.** Windows에서는 부모가 끝나도 자식 프로세스가 저절로 끝나지 않는다. 그 사이 신호가 끊겨 다른 실행기가 lease를 넘겨받으면 같은 프로젝트에서 두 실행이 겹칠 수 있다. Phase B 1단계 spike에서 자식 정리 방식을 확인하고, 확인 전에는 설계를 확정하지 않는다.
- **요청·쓰기가 는다.** 실행기 하나당 10분에 신호 10회(+ 1단계 폴링 10회)이고, DB 쓰기는 상태가 바뀌거나 30초가 지났을 때만 한다. 폴링이 이미 DB를 깨워 두고 있어서 쉬는 상태로 내려가지 못하는 문제는 지금과 같다.
- **모델 행동은 이 변경으로 바뀌지 않는다.** 도구 이름 접두어 누락 같은 문제는 상주 실행기에서도 같은 빈도로 날 수 있다. 실패 상한과 로그가 그 결과를 드러낼 뿐이다.

롤백 방법:

- **Phase A 서버.** main을 이전 커밋으로 되돌려 배포한다. 새 플러그인의 1단계 watch는 404를 받고 로컬 잠금만으로 계속 돈다. Phase B 출시 뒤라면 상주 실행기는 진행 중인 실행을 끝낸 뒤 멈추고 알린다(B-2). 마이그레이션은 추가형이라 테이블과 열을 남겨 둔다(지우려면 별도 마이그레이션).
- **Phase A 플러그인.** 옛 본문으로 판을 다시 올려 배포한다(롤백도 판 상승). 서버는 신호가 없는 실행기를 문제로 보지 않는다.
- **Phase B.** 플러그인 판을 다시 올려 background 스킬과 CLI를 뺀다. 사용자 PC에 남는 자동 시작 등록은 `autostart off`로 지운다. 판을 내리기 전에 그 명령을 안내한다. 서버는 resident lease가 오지 않을 뿐이다.
  - B-5의 웹 변경(`/billing` 행, 배너 Free 줄)도 같이 되돌려 배포한다. 남겨 두면 없어진 기능을 약속하게 된다.

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

- [x] 모든 `{placeholder}`를 처리했고, pending 문서의 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다. (A-5 표의 `{host}` 등은 문구의 값 자리다)
- [x] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다.
- [x] `stage`는 pending 문서에서만 사용했다.
- [ ] `stage: "approved"`라면 승인 기록이 모두 채워져 있다. (승인 전)
- [x] `proposal-size`는 standard다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용한다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [ ] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다. (실행 전)
- [x] 잔여 리스크를 명시했다.
