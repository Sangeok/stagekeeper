---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-09-05"
approved-by: "사용자"
approved-at: "2026-09-05"
approval-scope: "F01~F10 로컬 코드·private 템플릿 구현과 검증; 커밋·운영 배포·DB seed 제외"
completed-at: "2026-09-05"
verification-summary: "core/CLI 123, web 157, private templates 16, architecture 13 테스트 통과; check·build·lib 동기화 통과. 기존 lint 경고 1건 유지."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/README.md"
  - "docs/architecture/system-overview.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/verification.md"
  - "docs/proposals/active/src-clean-code-findings.md"
---

# plugin 클린코드 개선 완료 기록

## Summary

`plugin/` 전체를 `frontend-clean-code-orchestrator`의 독립 렌즈 다섯 개와 중립 품질 게이트로 검토했다.
원시 발견 15건을 중복 병합하고 2회의 실질 심사를 거쳐 **10건을 채택했다: Must 3, Should 5, Consider 2**.
CLI의 입력 검증·파일 기록 순서와 에이전트 템플릿의 실행 계약을 개선 대상으로 삼는다.
후속 구현 요청에 따라 10건을 로컬 코드와 private 템플릿에 반영하고 회귀 검사·통합 검사·빌드를 통과했다.
서버 판정·DB 스키마는 변경하지 않았으며 커밋·운영 배포·DB seed는 수행하지 않았다.

핵심은 예약 에이전트 이름 충돌, 입력 오류 뒤의 부분 초기화, 검증 전 중단 시 보류 절차의 충돌이다.
아래 F01~F10의 근거와 줄 번호는 **수정 전 검토 시점**의 기록을 보존한다.
구현 후 실제 CLI 실패·재실행과 서버 단계 엔진 연결 테스트 결과는 Verification Results에 별도로 기록했다.

## Goal

- 정상으로 수락한 설정이 다른 에이전트 정의나 사용자의 작업 제한을 바꾸지 않게 한다.
- 입력·렌더 오류를 최초 파일 기록 전에 발견하고 초기화 재실행 가능성을 보존한다.
- 스텁·단계 본문·런북의 지시를 서버 계약과 일치시킨다.
- 항목별 실제 수정 원본과 회귀 검증을 명시하여 변경과 검증 결과를 추적한다.

## Proposal Size

`standard`. 사용자 저장소의 파일 쓰기, 에이전트의 커밋 지시, 공유 설정 파서,
원격 응답 경계와 별도 저장소 템플릿이 관련된다. 여러 파일과 배포 경로가 영향을 받는다.

## Current State

다음 표는 2026-09-05 최초 검토의 기준선이다. 구현 후 상태는 Completion or Closure Notes를 참조한다.

| 항목 | 확인한 상태 |
| --- | --- |
| Stagekeeper 기준 | `02de0932a1f85ea263311705ace82dfca2e7ae89`, `harness/stale-followups`; 시작 시 작업 트리 clean |
| private templates 기준 | `606bcddb5f17925ced7c062e4b46600ec3472195`; 중첩 저장소 작업 트리 clean |
| 전수 검토 | `plugin/` 작업 파일 28개: manifest 1, bin 2, lib 11(빈 `.gitkeep` 포함), init skill 1, templates 13 |
| 실행 환경 | 로컬 Node `v22.13.1`; plugin은 Node ESM `.mjs` CLI이며 자체 package/React UI가 없음 |
| 루트 설정 | package 선언 Next `16.3.3`, React `19.2.8`, TypeScript `^5`; root strict가 plugin CLI 전체를 검사하는 구성은 아님 |
| 정책 원본 | `packages/core` → `plugin/lib` 배포 복사. 내용 동기화 검사 통과 |
| 템플릿 원본 | `plugin/templates`는 부모 Git이 무시하는 별도 private 저장소. DB `Template`을 통해 배포 |

`docs/architecture/`를 현재 구조의 기준으로 사용했다. FSD는 `src/fsd`에 적용되므로
plugin에 React layer나 slice 이동을 요구하지 않는다. `plugin/lib`의 복사는 의도된 배포 구조다.
템플릿은 서버에 단계 본문을 남기고 사용자 저장소에는 스텁을 설치한다.

검토한 파일 집합은 다음 명령으로 재확인할 수 있다. Git 내부 metadata는 제외한다.

```powershell
rg --files --hidden --no-ignore -g '!.git' plugin
```

## Scope

포함 범위:

- `plugin/.claude-plugin/plugin.json`, `plugin/bin/**`, `plugin/lib/**`, `plugin/skills/init/**`의 검토 및 아래 Affected Files의 구현.
- 로컬에서 읽을 수 있는 `plugin/templates/**`의 원본 템플릿·README·계약 테스트.
- 공유 core parser 원본·테스트의 수정과 배포본 동기화; 서버 단계·보고 계약과 보고 링크 소비자의 근거·회귀 확인.

제외 범위:

- `src` 전체 재리뷰, React/FSD 리팩터링, TypeScript 전환, 새 의존성 도입.
- private 템플릿을 공개 저장소에 복제하거나 단계 본문을 plugin에 동봉하는 변경.
- 서버 인가·검증 벽 완화, DB 스키마 변경, 운영 DB seed 실행.
- 커밋, PR, 실제 사용자 저장소 초기화.

## Proposal

심각도는 Must(실제 실패·위험한 부수효과), Should(유의미한 유지·계약 비용),
Consider(작고 낮은 긴급도의 개선)로 구분한다. 여러 렌즈의 일치는 심각도를 높이는 근거가 아니다.
이 절의 문제 설명·최소 변경·완료 기준은 승인된 원안을 보존한 것이며, 미해결 목록이 아니다.

### F01 · Must — workspace agent가 보고 역할을 덮어쓴다

기여 렌즈: 결합도 `CPL-01`, 예측가능성 `PRE-02`, TypeScript 일반 `TS-02`.

근거: `plugin/lib/config.mjs:24`는 이름 형식과 workspace 사이의 중복만 검사한다.
`plugin/lib/entitlement.mjs:8`의 보고 역할 이름을 거부하지 않는다.
`plugin/bin/harness-init.mjs:83`의 `targets[path]` 대입에 중복 검사가 없고,
보고 역할 등록(`:92`) 뒤 workspace 등록(`:95`)이 실행된다.

`workspaces[0].agent = "pm"`인 설정은 파싱을 통과하고 같은
`.claude/agents/pm.md`에 dev 스텁이 들어간다. 초기화 성공과 실제 역할 정의가 어긋난다.
서버 권한 우회가 입증됐다는 뜻은 아니다.

최소 변경: `packages/core/config.mjs`가 `REPORT_AGENTS` 이름을 필드 경로 오류로 거부하도록 하고
배포본을 동기화한다. 생성기의 목적지 중복 거부도 좁은 추가 방어로 둔다.

완료 기준: 네 보고 역할 이름을 workspace에 지정하면 최초 쓰기 전에 실패한다.
정상 dev 이름과 기존 workspace 중복 검사 동작은 유지한다.

### F02 · Must — 입력 준비가 끝나기 전에 파일을 쓴다

기여 렌즈: 결합도 `CPL-02`, 예측가능성 `PRE-01`, TypeScript 일반 `TS-01`.

근거: `plugin/bin/harness-init.mjs:108`에서 일반 생성물을 쓴 뒤 런북 조회·렌더(`:111`)와
기존 `.mcp.json` 파싱(`:122`)을 수행한다. lock은 `:129`에서 기록한다.
`plugin/lib/manifest.mjs:12`·`:14`는 lock에 없는 기존 파일을 충돌로 분류한다.

첫 초기화에서 MCP JSON이 잘못되면 문서·에이전트·런북은 남고 lock은 없을 수 있다.
입력을 고쳐 재실행해도 `refuse`로 막히며, 갱신 도중 실패하면 이전 lock과 파일 해시가 어긋날 수 있다.

최소 변경: 일반 생성물, 런북, MCP 병합, 입력 형태 검사, 다음 lock 계산까지 메모리에서 완료한 뒤
쓰기를 시작한다. dry-run과 실제 실행이 같은 준비 결과를 사용하게 한다.
이는 입력 오류로 인한 부분 쓰기를 줄이는 변경이며 디스크 I/O 실패까지 원자성을 보장하지 않는다.

완료 기준: 깨진 MCP JSON, 누락된 런북, 런북의 미치환 변수로 실패할 때 기존 파일은 그대로이고
새 생성물·lock은 생기지 않는다. 정상 실행, 사용자 수정 건너뛰기, adopt, dry-run 동작을 유지한다.

### F04 · Must — verify 원장이 없는 구현 중단에서 보류 절차가 막힌다

기여 렌즈: 예측가능성 `PRE-03`. 보고 가시성과 재시도 조건을 보완한 수정본이 채택됐다.

근거: `plugin/templates/en/agents/dev.md:189`는 implement의 blocked를 verify 없이 hold로 보낸다.
hold는 `:277`에서 `report_submit`을 먼저 요구하지만,
`src/server/pipeline/board-rules.ts:109`는 implementing 상태에서 verify 원장이 없으면 이를 거부한다.

정확한 조건은 같은 project/actor/key에 이전 시도를 포함한 verify 원장이 없을 때다.
`src/server/pipeline/board.ts:200`의 조회는 현재 run에 한정되지 않는다.
따라서 이전 verify 기록이 있는 재시도까지 항상 막힌다고 일반화하면 안 된다.

최소 변경: `dev.md`의 hold 절차와 `plugin/templates/en/docs/agents/README.md:17`의
보고 규약을 함께 정리한다. 현재 verify failed/blocked를 실제 기록한 경로는 기존 제출→보류 순서를 유지한다.
검증 전 중단은 커밋 권한과 실제 보고 커밋이 있을 때 제출 결과를 확인하고,
verify 원장 부재라는 특정 거부에 대해서만 로컬 보고를 남겨 보류하는 예외를 명시한다.
다른 서버 오류를 이 예외로 삼지 않는다.

보고 없는 보류 전이는 현재 서버가 허용한다. 그러나 새 Report 행은 생기지 않아 서버 보고 목록과
웹 보고 링크에도 나타나지 않는다(`board.ts:75`·`:205`,
`src/fsd/pages/board-item/model/item-docs.ts:18`).
보류 후에는 report_submit도 불가능하므로 나중에 같은 API로 제출하라는 안내를 두지 않는다.

최종 인계에는 보고 경로, 실제 커밋 여부, 서버 등록 여부와 웹 링크 부재를 표시한다.
커밋 권한이 없다면 새 커밋이나 기존 HEAD를 보고 커밋으로 꾸며 제출하지 않고 F05의 인계 정책을 따른다.
모든 중단 보고를 웹에도 노출해야 한다면 별도 서버 보고 계약을 결정해야 한다.

완료 기준: verify 기록 없는 첫 중단, 이전 기록 있는 재시도의 중단, 현재 verify failed/blocked 후 보류,
미허가 커밋 상황을 각각 검증한다. 허위 verify 기록과 검증 조건 완화는 사용하지 않는다.

### F09 · Should — 잘못된 readOnly 입력이 제한 없음으로 바뀐다

기여 렌즈: TypeScript 일반 `TS-03`.

근거: `plugin/lib/config.mjs:33`은 배열이 아닌 값을 모두 `[]`로 바꾼다.
`readOnly: "src/generated/**"`가 성공으로 처리되고,
`plugin/lib/vars.mjs:3`·`:26`을 거쳐 dev 템플릿 `:29`에 `none`이 표시된다.

최소 변경: `undefined`만 생략 기본값으로 처리하고 명시된 비배열은
`workspaces[i].readOnly` 오류로 거부한다. core 원본에서 수정하고 동기화한다.
다른 중첩 객체 검증의 일괄 재설계로 범위를 넓히지 않는다.

완료 기준: 생략·빈 배열·문자열 배열은 허용하고 문자열·null·객체 입력은 실패한다.
유효한 readOnly 경로의 렌더 결과를 확인한다.

### F10 · Should — 원격 응답의 실제 소비 필드를 검증하지 않는다

기여 렌즈: TypeScript 일반 `TS-04`.

근거: `plugin/bin/harness-init.mjs:60`은 외피만 확인한 후 구조 분해(`:66`),
plan 사용(`:70`), `agents.includes`(`:89`)를 수행한다.
`plugin/lib/render.mjs:3`도 본문이 문자열이라고 전제한다.
누락된 agents는 예외가 되고 문자열 agents는 배열 검색이 아닌 문자열 검색으로 동작한다.

최소 변경: 알려진 plan, agents의 문자열 배열 형태, 실제 사용할 템플릿의 문자열 타입을
소비 경계에서 검증하여 일관된 호환성 오류를 낸다. 필요한 템플릿의 존재와 렌더 완료는 F02에 연결한다.
사용하지 않는 미래 필드·역할까지 무조건 거부하는 폐쇄 스키마나 새 라이브러리는 필요 없다.

완료 기준: agents 누락·문자열, 잘못된 plan, 비문자열 필수 템플릿은 쓰기 전에 명확히 실패한다.
정상 응답과 미사용 확장 필드를 포함한 응답은 기존 계약대로 처리한다.

### F05 · Should — 공통 커밋 금지와 단계별 필수 커밋이 충돌한다

기여 렌즈: 예측가능성 `PRE-04`, 가독성 `READ-01`.

근거: `plugin/templates/en/agents/dev.md:53`은 owner 요청 없는 commit/push를 금지하고
`:55`·`:125`는 Bash를 읽기·검증으로 제한한다. 반면 `:131`·`:242`·`:276`은
plan/report/hold 단계에서 커밋을 요구한다. 제출 API는 commit 값을 받으므로 실제 절차 해석에 영향을 준다.

최소 변경: 현행 owner 요청 정책을 보존하면서 허가된 커밋의 Bash 예외를 명시하고,
권한이 없으면 파일 준비 후 커밋 담당자에게 인계하고 실제 커밋을 받아 재개하는 절차를 정한다.
자동 커밋 허용으로 바꾸는 것은 별도 정책 선택이다.

완료 기준: 커밋 권한 있는 dispatch와 없는 dispatch 모두 일관된 다음 행동을 가진다.
푸시 권한까지 확대하지 않으며 허구의 commit 값을 제출하지 않는다. F04의 중단 인계도 같은 정책을 따른다.

### F06 · Should — 선택적인 scout를 런북은 무조건 파견한다

기여 렌즈: 예측가능성 `PRE-05`.

근거: `plugin/bin/harness-init.mjs:93`은 scout 설정이 있어야 파일을 만들며,
`plugin/bin/harness-init.test.mjs:126`이 생략을 의도된 동작으로 검사한다.
일반 런북 `plugin/templates/en/CLAUDE.runbook.md:35`·`:77`와
Free 런북 `plugin/templates/en/CLAUDE.runbook.free.md:34`·`:69`에는 같은 전제가 없다.

최소 변경: 두 런북의 역할표와 파견 문장 모두에 scout가 구성된 경우라는 전제를 명시한다.
설정에 따라 해당 부분을 생성하지 않는 대안도 가능하지만 일반 조건부 템플릿 엔진은 필요 없다.

완료 기준: scout 없는 정상 설정의 생성물이 존재하지 않는 에이전트 파견을 필수로 요구하지 않는다.
scout 있는 설정은 기존 파견 절차를 유지한다.

### F03 · Should — 필수 외부 skill의 공급·호환성 계약이 없다

기여 렌즈: 결합도 `CPL-03`.

근거: `plugin/templates/en/agents/plan-verifier.md:98`은
`reconciling-proposals-with-codebase`와 INV-1~7을 요구하고 `:117`은 로딩 실패를 blocked로 처리한다.
일반 런북 `:49`, Free 런북 `:47`도 이 skill을 요구한다.
`plugin/skills/init/SKILL.md:8` 이하의 설치 절차와 manifest에는 의존성 확보·호환성 확인이 없다.

최소 변경: 지원하는 공급 경로와 요구 계약을 명시하고 init 절차에서 가용성을 확인한다.
특정 개발자의 로컬 skill 경로를 CLI에 하드코딩하지 않는다.
외부 의존성을 유지할지 private 서비스 템플릿으로 필요한 절차를 소유할지는 구현 전에 결정할 사항이다.

완료 기준: skill 없는 환경에는 설치 완료 이전에 정확한 준비 안내가 제공되고,
지원하는 skill이 있는 환경에서는 필요한 검증 절차를 시작할 수 있다.
모든 고객에게 이 skill이 없다는 주장은 아니다.

### F07 · Consider — 인수 지시가 result를 보고서 경로처럼 설명한다

기여 렌즈: 가독성 `READ-02`.

근거: 일반 런북 `:69`, Free 런북 `:63`은 result가 가리키는 보고서를 열도록 하지만,
`plugin/templates/en/agents/dev.md:243`은 위치를 `path, commit`으로 제출하고
`:246`은 result를 작업·검증 요약으로 정의한다.
런북에 보고 경로 규약 자체는 있으므로 경로를 전혀 찾을 수 없는 차단 결함으로 보지는 않는다.

최소 변경: `board_get`의 보고 기록에서 path와 commit을 확인해 해당 보고서를 열도록 두 문장을 고친다.
result에 경로를 강제하는 API 변경은 하지 않는다.

완료 기준: 경로 없는 정상 요약 result로도 기록된 보고서의 위치와 커밋을 확인할 수 있다.

### F08 · Consider — 런북 처리 로그의 조건이 실제 분기와 다르다

기여 렌즈: 가독성 `READ-03`.

근거: `plugin/bin/harness-init.mjs:115`은 `s >= 0 && e > s`일 때 교체하지만
`:117`의 replaced 출력은 `s >= 0`만 확인한다. 시작 마커만 있으면 추가하면서 교체라고 출력한다.

최소 변경: 의미 있는 교체 가능 여부 boolean을 처리와 로그가 공유한다.
손상 마커의 별도 거부·복구 정책까지 확대하지 않는다.

완료 기준: 정상 마커 쌍, 마커 없음, 시작 마커만 있음에서 dry-run 설명과 실제 처리 분기가 일치한다.

## Affected Files

| 실제 수정 원본 또는 영역 | 작업 | 항목 | 리스크 |
| --- | --- | --- | --- |
| `plugin/bin/harness-init.mjs` | update | F01·F02·F08·F10 | medium — 초기화·갱신·dry-run 기록 순서 |
| `plugin/bin/harness-init.test.mjs` | update | F01·F02·F08·F10의 CLI 회귀 | low — 기존 fixture 활용 |
| `packages/core/config.mjs`, `config.test.mjs` | update | F01·F09 | medium — plugin 밖 소비자도 사용하는 parser |
| `plugin/lib/config.mjs` | regenerate | core 변경 후 sync | low — 복사본 직접 수정 금지 |
| `plugin/skills/init/SKILL.md` | update | F03 | medium — 설치 완료 기준·의존성 안내 |
| `plugin/skills/init/references/reconciliation-contract.md` | add | F03 외부 skill 계약 v1 | medium — 공급 경로·해석된 패키지의 사전 검사 |
| private `plugin/templates/en/agents/dev.md` | update | F04·F05 | high — 실행 단계·권한·보고 인계 |
| private `plugin/templates/en/docs/agents/README.md` | update | F04 보고 예외 | medium — 로컬 기록과 서버 등록 구분 |
| private `plugin/templates/en/CLAUDE.runbook{,.free}.md` | update | F03·F06·F07; F05의 dispatcher 인계 | medium — 일반·Free 절차 일치 |
| private `plugin/templates/en/agents/plan-verifier.md` | update | F03 공급·호환 계약 정합성 | medium — 검증 절차의 외부 의존 |
| private `plugin/templates/templates.test.mjs` | update | 템플릿 계약·실패 경로 검증 | medium — 실제 서버 파서와 함께 검사 |

서버 판정·단계 엔진·웹 보고 링크 코드는 근거와 회귀 확인 대상이다.
기본안은 서버 API·스키마 변경을 포함하지 않는다. F03의 공급 방식이나 F04의 서버 보고 노출 요구가
바뀌면 실제 파일 목록과 승인 범위를 먼저 갱신한다.

## Safety Analysis

- 기록 부수효과를 확인했다. F02는 준비와 기록을 나누며 정상 overwrite/adopt/skip 계약을 보존해야 한다.
- core와 복사본 관계를 확인했다. `plugin/lib`만 고치면 동기화로 사라지므로 원본 변경과 sync를 함께 검증한다.
- 템플릿은 별도 저장소다. 부모 저장소 PR만으로 본문 변경이 배포되지 않는다.
- F04는 서버의 verify 조건을 유지한다. 로컬 보고만 남기는 예외의 가시성 손실을 숨기지 않는다.
- F05는 커밋 권한을 새로 부여하지 않는다. 실제 커밋·미커밋 상태를 인계한다.
- F10은 입력 소비 경계 검증이다. 토큰 출력이나 원격 응답 본문 전체 로깅을 해결책으로 추가하지 않는다.
- React 라우팅, 브라우저 상태, public 자산, barrel 변경, ambient type 변경은 제안하지 않는다.
- 스텁 내용이 바뀌는 F05와 런북 변경은 기존 설치 저장소에도 재초기화가 필요하다.
  사용자 수정으로 skip되는 파일은 자동 갱신됐다고 간주하면 안 된다.

## Approval

문서를 바탕으로 실제 코드를 수정하라는 후속 요청을 받아 구현했다. 승인 기록은 front matter만 사용한다.

F03은 현행 외부 의존성을 유지하는 최소안으로 확정했다. Owner가 승인한 완전한 패키지를 공급하고,
연결 프로젝트의 `.claude/skills/reconciling-proposals-with-codebase/` 또는 실제 해석 가능한
개인·관리형 설치를 contract v1으로 검사한다. 임의 다운로드·자동 설치·개발자 개인 경로 하드코딩은 없다.
F04는 verify 원장 부재라는 특정 거부에서만 로컬 보고를 보존한다. 서버·웹에 모든 중단 보고를
표시하는 계약 확장은 하지 않았다. F05는 owner 요청 정책과 별도의 push 권한을 유지한다.

## Execution Plan

1. F01·F09: 공유 parser 입력 계약과 실패 사례를 고치고 plugin 배포본을 동기화한다.
2. F02·F10·F08: CLI의 전체 준비 결과를 먼저 만들고 응답 검증·dry-run 설명을 맞춘다.
3. F04·F05: private 템플릿의 중단 보고와 커밋 인계를 함께 정리한다.
4. F06·F07: 일반·Free 런북의 선택 에이전트 조건과 보고서 확인 문장을 맞춘다.
5. F03: owner 공급 외부 패키지의 contract v1을 init·검증 템플릿·런북에 동일하게 반영한다.
6. 두 저장소의 변경을 각각 검증한다. 배포 대상·버전 정합성, DB seed와 사용자 재초기화는 별도 배포 단계에 남긴다.

1~6의 로컬 구현·검증은 완료했다. 범위 밖 운영 배포는 완료로 표시하지 않는다.

구현 브랜치는 `dev`에서 `harness/<topic>`으로 만들고 PR은 `--base dev`로 연다.
`check`가 green일 때만 dev에 병합한다. 여기서는 브랜치 생성·커밋·PR을 수행하지 않았다.

## Verification Plan

아래 명령을 로컬 구현에 적용했다. 실제 실행 결과와 검증 한계는 다음 절에 기록한다.

```powershell
npm run sync:plugin-lib
node scripts/check-plugin-lib.mjs
npm run verify:fsd
npm run test:architecture
npm run check
npm test
npm run test:web
npm run test:templates
npm run build
```

`sync:plugin-lib`는 core를 변경했을 때 실행한다.
`npm run check`는 lint, FSD, next typegen, tsc, architecture, lib drift를 포함한다.
`test:templates`는 private 저장소가 있는 환경에서 실행해야 하며 부모 CI는 의도적으로 이를 생략한다.
위 명령들은 타입 생성·빌드 산출물·임시 테스트 파일을 만들 수 있다.

| 검증 대상 | 확인할 결과 |
| --- | --- |
| F01·F09 | 예약 역할 이름·잘못된 readOnly 입력 거부, 정상 설정과 생성물 보존 |
| F02 | 입력·렌더 실패에서 파일 무변경, 정상 기록·갱신·adopt·skip·dry-run 회귀 없음 |
| F10 | 잘못된 응답의 명확한 오류, 소비하지 않는 확장 필드의 호환성 유지 |
| F04·F05 | 최초/재시도 verify 원장 차이, verify 실패 후 보류, 커밋 권한 차이와 실제 인계 결과 |
| F03·F06·F07 | skill 부재 안내, scout 선택 조건, report path/commit 확인 절차 |
| F08 | 세 마커 입력의 처리 결과와 로그 일치 |

F04는 본문에 특정 단어가 있는지만 검사해서는 충분하지 않다.
기존 `src/server/agents/next.test.ts`, `src/server/pipeline/board-rules.test.mjs`와 실제
템플릿 계약 테스트를 참조해 현재 단계의 기록·제출 판정·보류 전이를 함께 확인한다.
LLM이 지시를 어떻게 수행하는지는 별도 통제된 시나리오 점검이 필요하다.

구현 시작 시 core/CLI 86건, private templates 9건과 check의 통과 기준선을 확보했다.
web 157건은 parser 수정 후 처음 실행해 통과했으므로 변경 전 web 기준선으로 주장하지 않는다.
기존 billing lint 경고는 변경 전후 동일하며 이 제안에 포함하지 않는다.

## Verification Results

### 최초 제안서 리뷰 기록

| 구분 | 수행 및 결과 |
| --- | --- |
| 리뷰 범위 확인 | 28개 작업 파일을 다섯 독립 렌즈가 검사; private templates 포함 |
| 원본 동기화 | `node scripts/check-plugin-lib.mjs` → exit 0, `plugin/lib in sync` |
| 기준 식별 | 부모·중첩 저장소 HEAD와 시작 시 clean 상태 확인 |
| 문서 정합성 | 발견 10개·원시 판정 15개, 후행 공백 0개 확인; 최초 리뷰 종료 시 제안서 1개만 추가되고 중첩 저장소는 clean |
| Review-mode substantiation | 정적 소스·서버 계약 대조. 게이트가 실행 입증을 요구한 pending-verification 없음 |
| CLI 실패 동적 재현 | Not run — 실제 파일을 생성하는 재현을 이번 리뷰에서 실행하지 않음 |
| 구현 후 회귀·lint·typecheck·build | 최초 리뷰 때 미실행; 후속 구현 결과는 아래 표 참조 |
| 템플릿 DB 배포·사용자 초기화 | Not run — 이번 요청 범위 밖 |

### 구현 후 검증

| 명령·확인 | 결과 |
| --- | --- |
| `npm run sync:plugin-lib` | 통과 — core 원본을 `plugin/lib`에 동기화 |
| `node scripts/check-plugin-lib.mjs` | 통과 — `check`에도 포함, drift 없음 |
| `npm test` | 123/123 통과 — 기존 86건에서 37건 증가 |
| `npm run test:web` | 157/157 통과 |
| `npm run test:templates` | 16/16 통과 — 기존 9건과 실제 단계 엔진 연결 7건; 최종 인계 재개 문구 수정 후 재실행 |
| `npm run verify:fsd` | 통과 — 의존 방향과 경계 위반 없음 |
| `npm run test:architecture` | `check` 안에서 13/13 통과 |
| `npm run check` | 통과 — lint, FSD, Next typegen, tsc, architecture, lib sync |
| `npm run build` | 통과 — Prisma Client 생성, Next 프로덕션 컴파일·타입 검사·페이지 생성 완료 |
| 부모·private 저장소 `git diff --check` | 통과 — 공백 오류 없음 |

기존 경고: `src/app/(app)/billing/page.tsx:5:10`의 미사용 `planForUser` 1건.
관련 없는 코드를 수정하거나 규칙을 억제하지 않았다.

동적 검증 범위:

- F01·F09: 네 예약 역할, 잘못된 제한 입력과 정상값을 parser 및 CLI 경계에서 검사했다.
- F02·F10: 잘못된 MCP/lock/응답·누락/미치환 런북에서 파일 스냅샷이 그대로인지,
  MCP를 고친 뒤 adopt 없이 초기화·갱신이 되는지 확인했다. 기존 adopt/skip 회귀도 통과했다.
- F08: 마커 없음·정상 쌍·시작 마커만 존재하는 세 입력에서 dry-run 로그와 실제 쓰기 결과를 비교했다.
- F04·F05: 실제 private dev 템플릿과 `agentNext`, `decideReportSubmit`, `decideTransition`을 연결했다.
  DB·네트워크 경계만 메모리로 대체하여 이전 verify 원장 유무, 현재 verify failed/blocked,
  보고 없는 보류 허용과 보류 후 제출 거부, plan/report/hold의 outcome 없는 재개를 확인했다.
- F03·F06·F07: init·참조 계약·검증자·일반/Free 런북의 문구를 대조했고 전체 템플릿 렌더·단계 파싱을 검사했다.

검증 한계: 실제 Claude Code에서 외부 패키지를 설치·해석하거나 에이전트가 인계를 수행하는 세션,
실제 git 커밋·운영 API·DB seed는 실행하지 않았다. 텍스트 계약과 엔진 테스트가 LLM 행동까지
보증하는 것은 아니다. CLI 직접 실행은 파일 생성기이며 외부 skill 사전 검사는 `/harness:init` 절차의 책임이다.

## Risks and Rollback

- 발견은 위 두 HEAD의 로컬 원본 기준이다. 운영 DB에 어떤 템플릿 버전이 seed되어 있는지는 확인하지 않았다.
- F02 이후에도 권한 오류·디스크 부족·중단에 의한 부분 쓰기는 가능하다. 완전한 원자성은 별도 범위다.
- F01·F09는 이전에 수락하던 설정을 거부한다. 기존 예약 이름 충돌·잘못된 readOnly 설정을 실행 전에 수정해야 한다.
- F04의 로컬 보고는 서버 보고 목록·웹 링크에 없다. 이 가시성이 제품 요구에 맞는지 확인해야 한다.
- 템플릿 단계 변경은 진행 중 run에 영향을 줄 수 있다. 본문·스텁 배포와 사용자 재초기화 시점을 맞춘다.

코드 회귀는 해당 구현 커밋을 revert하고 core 배포본을 다시 동기화한다.
private 템플릿 회귀는 그 저장소의 변경을 별도로 되돌리고 승인된 이전 본문을 DB에 재배포한다.
부모 커밋 revert만으로 DB 본문이나 사용자 저장소의 생성물이 복구되지는 않는다.
실제 초기화 전에는 대상 저장소의 사용자 수정·생성물·lock 상태를 보존하여 필요한 파일만 복구할 수 있게 한다.

## Review Coverage and Traceability

**Full applicable-lens review — 적용 렌즈 5개, Gate-validated N/A 0개.**
각 렌즈는 서로의 출력 없이 동일한 대상·프로젝트 맥락과 해당 스킬만 받아 검토했다.
중립 게이트는 15개 원시 발견을 모두 판정했고, 2차 심사에서 PRE-03 수정까지 채택했다.
채택된 근거의 중복은 기여 렌즈를 보존하여 병합했다.

| 렌즈 | 최종 상태 | 채택 기여 |
| --- | --- | --- |
| Cohesion / 응집도 | Applicable · No supported findings | 없음 — 설정 검증·파일 소유권·공유 정책·계약 검사 배치에서 지원되는 추가 결함 없음 |
| Coupling / 결합도 | Completed | F01·F02·F03 |
| Predictability / 예측가능성 | Completed | F01·F02·F04·F05·F06 |
| Readability / 가독성 | Completed | F05·F07·F08 |
| TypeScript generalist | Completed | F01·F02·F09·F10 |

TypeScript 일반 렌즈는 대상 내 `templates.test.mjs`가 실제 TS 서버 파서를 사용하는 점과
관련 테스트·설정을 근거로 적용했다. MJS 코드에 TS 문법이나 React 규칙을 강제하지 않았다.

다음 표는 최종 판정과 전체 raw → canonical 매핑을 함께 보존한다.

| Raw ID | 원 렌즈 | 제안 등급 | 최종 disposition | Canonical ID | 최종 등급 | 판정 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| CPL-01 | Coupling | Must | accept | F01 | Must | 보고 역할 목적지 덮어쓰기 |
| CPL-02 | Coupling | Must | accept | F02 | Must | 입력 실패 뒤 산출물·lock 불일치 |
| CPL-03 | Coupling | Should | accept | F03 | Should | 필수 skill의 공급·호환 계약 부재 |
| PRE-01 | Predictability | Must | merge-accept(F02) | F02 | Must | 같은 쓰기 순서·실패·수정 |
| PRE-02 | Predictability | Must | merge-accept(F01) | F01 | Must | 같은 역할 이름 충돌 |
| PRE-03 | Predictability | Must | accept | F04 | Must | 원장·로컬 보고 가시성·커밋 권한을 구분한 수정본 채택 |
| PRE-04 | Predictability | Should | accept | F05 | Should | 커밋 금지와 필수 단계 충돌 |
| PRE-05 | Predictability | Should | accept | F06 | Should | 선택 scout의 무조건 파견 |
| READ-01 | Readability | Should | merge-accept(F05) | F05 | Should | 같은 권한·인계 규칙 충돌 |
| READ-02 | Readability | Should | accept | F07 | Consider | 필드 설명 오류지만 경로 규약이 제공되어 영향 제한 |
| READ-03 | Readability | Consider | accept | F08 | Consider | 교체 분기와 로그 조건 불일치 |
| TS-01 | TypeScript generalist | Must | merge-accept(F02) | F02 | Must | 같은 준비·쓰기·복구 문제 |
| TS-02 | TypeScript generalist | Must | merge-accept(F01) | F01 | Must | 같은 예약 역할 충돌 |
| TS-03 | TypeScript generalist | Should | accept | F09 | Should | 잘못된 제한 입력을 성공으로 처리 |
| TS-04 | TypeScript generalist | Should | accept | F10 | Should | 소비 필드의 형태 검증 부재 |

기각·검증 대기·추가 수정 요청·미해결 증거 다툼은 없다. Unavailable·Skipped도 없다.
추가 발견이 없는 적용 렌즈는 응집도다. 제품 선택의 구현 결정은 Approval에 명시했으며
검토 결과의 증거 부족이나 부분 검토를 뜻하지 않는다.

## Completion or Closure Notes

10건의 로컬 구현·검증을 마쳐 저장소 문서 규칙에 따라 `completed/`로 이동했다.

| 항목 | 구현 결과 |
| --- | --- |
| F01·F09 | core parser에서 예약 보고 역할·비배열 readOnly 거부, plugin 배포본 동기화 |
| F02·F10·F08 | CLI 쓰기 전 전체 입력 준비, 소비 필드/lock/MCP 검증, 중복 목적지 방어, 로그 분기 일치 |
| F04·F05 | specific missing-verify 거부만 로컬 보고 예외, 서버/웹 미등록 명시; owner 커밋 인계와 중복 작성 없는 단계 재개 |
| F03 | 외부 패키지 공급·호환성 contract v1, 파일 기록 전 init 사전 검사와 검증 세션 재검사 |
| F06·F07 | 일반·Free 런북에서 scout 구성 조건과 board_get의 report path/commit 사용 명시 |

작업은 `harness/plugin-clean-code` 브랜치에 커밋했다(2026-09-05). 작성 시점에는 `harness/stale-followups`에
있었으나 그 브랜치는 머지 후 삭제됐고 미커밋 변경만 `dev` 위로 따라왔다 — 그래서 새 브랜치를 팠다.
부모 기준 HEAD와 private 템플릿 기준 HEAD는 Current State와 같고 변경은 미커밋 상태다.
private 저장소에는 6개 파일(`dev`, `plan-verifier`, 보고 README, 런북 2개, 계약 테스트)이 변경됐다.
부모 저장소가 이 경로를 무시하므로 부모 변경의 커밋·PR만으로 이 수정이 보존되거나 배포되지 않는다.

잔여 운영 작업: private 변경을 별도로 버전 관리하고 서버 템플릿 DB에 승인된 버전을 배포한 뒤,
클라이언트 plugin 버전과 맞춰 기존 연결 저장소를 재초기화한다. 사용자 수정으로 skip된 파일은
수동 조정 여부를 확인한다. 외부 skill 패키지 공급·실제 세션 사전 검사도 해당 연결 환경에서 수행한다.
이 운영 작업은 이번 로컬 구현의 완료 범위 밖이며 실행하지 않았다.

## Review Checklist

- [x] completed 위치와 완료 metadata가 일치하고 사용자 구현 승인 기록을 남겼다.
- [x] 원시 발견 15건과 채택 10건의 연결, 최종 등급과 기여 렌즈를 기록했다.
- [x] 원본과 배포 복사본, 별도 private 저장소와 DB 배포를 구분했다.
- [x] 변경 범위·제외 범위·안전성·검증 기준·롤백 방법을 명시했다.
- [x] 최초 정적 리뷰, 구현 후 동적 검증과 실제 세션 검증의 한계를 구분했다.
- [x] 로컬 구현 완료와 미실행 운영 배포·DB seed를 구분했다.
