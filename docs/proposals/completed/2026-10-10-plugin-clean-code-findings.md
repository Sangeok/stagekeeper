---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-10"
approved-by: "requester"
approved-at: "2026-10-10"
approval-scope: "12개 canonical ID의 Core 구현, 공개 코드·private 템플릿 수정과 계획된 회귀·Windows native 검증"
completed-at: "2026-10-10"
verification-summary: "12건 구현 완료. check·FSD·lint·type·build 통과; core/plugin 368 pass·2 skip, web 585 pass, server 55 pass·1 skip 및 fresh manifest 4 pass, private templates 59 pass, Windows native 35 pass·0 skip. 구현 diff의 독립 5개 렌즈·중립 게이트에서 추가 발견 없음."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/README.md"
  - "docs/architecture/system-overview.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/verification.md"
  - "docs/proposals/completed/2026-09-05-plugin-clean-code-findings.md"
  - "docs/proposals/active/codex-dual-client-runtime-follow-ups.md"
  - "docs/proposals/active/impl-verifier.md"
  - "docs/test-reports/active/dual-client-runtime-report.md"
---

# plugin 클린코드 개선 제안

## Summary

`plugin/` 전체를 `frontend-clean-code-orchestrator`의 독립 렌즈 다섯 개와 중립 품질 게이트로 검토했다.
원시 발견 13건의 복합 주장을 원래 검토자가 좁힌 뒤, 두 차례 품질 심사에서 **12건을 채택했다: Must 2, Should 10, Consider 0**.
인수 실패 계약의 중복 1건은 병합했고, 정상 QA 보고 파일에 대한 지침은 독립된 Should 항목으로 확정했다.
우선 해결할 문제는 Codex 역할에 필요한 서버 오류 정보가 사라지는 흐름과, 초기화 실패가 브리지·QA 세션의 정리 경계를 벗어나는 흐름이다.

최초 요청의 산출물은 이 제안서였으며, 후속 구현 요청에 따라 아래 **12건 전부를 공개 코드·스킬·private 템플릿에 적용하고 회귀 검증했다**.
공개 파일 20개와 private 파일 4개를 수정했다. 구현 diff의 독립 다섯 렌즈 및 중립 품질 게이트에서도 추가 개선 사항은 발견되지 않았다.
아래 발견·행 번호·계획과 정합화 근거는 구현 전 기준을 보존한다. 실제 수행 결과는 `Verification Results — 구현 후 회귀 검증`과
`Completion or Closure Notes`를 따른다. 운영 DB·설치된 package·실제 모델 인수는 별도 상태다.

2026-10-10 코드베이스 정합화의 **첫 검증에서 제안서에 개선할 점이 있었다**. 발견 12건 자체와 별개로,
오류 형식의 호환성, 부분 초기화의 정리 순서, 정책 이동의 import·시험, 최종 생성물, 검증 전제와 완료 조건이 불충분했다.
아래 계획에 이를 반영했다. 문서 정합화와 코드 구현·설치 인수는 서로 다른 완료 상태다.

## Goal

- 서버의 정상적인 도메인 거부와 로컬 권한·소유권 실패를 역할이 구분할 수 있게 한다.
- 실패한 실행의 리소스를 정리하면서 기존 중지·잠금·미확인 실행 보존 계약을 유지한다.
- Codex와 Claude에 전달하는 공통 서버 정책의 변경 누락을 줄인다.
- 초기화의 클라이언트별 의존성과 요청 대기 시간을 명시한다.
- 실행 바인딩과 보안 정책을 읽는 데 필요한 문맥을 줄인다.

## Proposal Size

`standard`. 네트워크 응답, 사용자 저장소 초기화, 역할 리소스 수명, 보안 정책 조건식,
두 클라이언트의 스킬과 별도 private 템플릿 저장소가 관련된다. 전체 실행 시 5개 이상 파일이 영향을 받는다.

문서 크기 분류와 별개로 reconciliation Review Profile은 **High-Risk**다.
오류 공개 경계, 실행 소유권·정리, private 원본에서 생성물로 이어지는 경로가 포함되므로 INV-1부터 INV-7까지 모두 적용한다.

## Current State

| 항목 | 검토 기준 |
| --- | --- |
| 검토일 | 2026-10-10 |
| 공개 저장소 기준 | `6d16410487c4a4ff5e991ee5024e44f9fb9b4ec5`, 시작 시 `dev`, 작업 트리 clean |
| private 템플릿 기준 | `405ca54a31653058188b372b459292f1d07d88d3`, 시작 시 작업 트리 clean |
| 실행 환경 | 로컬 Node `v22.13.1`; plugin은 Node ESM `.mjs`와 Windows PowerShell/C# 지원 코드 |
| 루트 설정 | Next `16.3.3`, React `19.2.8`, TypeScript `^5`; root strict 설정의 include는 plugin `.mjs` 전체를 검사하는 구성이 아님 |
| 정책 소유권 | `packages/core`가 원본, `plugin/lib`는 배포 복사본; `node scripts/plugin-lib.mjs --check` 통과 |
| 템플릿 소유권 | `plugin/templates`는 부모 Git이 무시하는 별도 private 저장소; 단계 본문은 DB를 통해 공급 |
| 리뷰 방법 | 각 렌즈가 별도 독립 문맥에서 전체 대상을 읽고, 중립 게이트가 위치·영향·범위·중복·최소 변경을 심사 |

검토 대상은 `.git` 내부를 제외한 **69개 파일**이다. 공개 추적 파일 53개와 로컬 private 파일 16개를 포함한다.

| 영역 | 파일 수 |
| --- | ---: |
| `plugin/bin` | 13: CLI `.mjs` 4, PowerShell wrapper 1, 테스트 8 |
| `plugin/runtime` | 11: `.mjs` 9, Windows 지원 파일 2 |
| `plugin/lib` | 19 |
| Claude/Codex skills 및 references | 7 |
| 숨김 plugin manifests | 2 |
| plugin 루트 README | 1 |
| private `plugin/templates` | 16: runbook 2, 역할 7, 공통 문서 4, 테스트 1, 관리 문서 2 |
| **합계** | **69** |

```powershell
rg --files --hidden --no-ignore -g '!.git' plugin
git ls-files plugin
```

[현재 아키텍처](../../architecture/README.md)를 기준으로 판정했다.
FSD는 `src/fsd`에 적용되므로 plugin에 React layer·slice 이동을 요구하지 않는다.
`plugin/lib`의 복사는 의도된 배포 구조다. 이전 [개선 완료 기록](../completed/2026-09-05-plugin-clean-code-findings.md)은
과거 기준선이며, 그 발견을 현재 미해결 문제로 재사용하지 않았다.

아래 위치와 행 번호는 이 검토 기준의 작업 파일을 가리킨다. private 파일은 로컬 근거이며 공개 저장소에서 본문을 열 수 없다.
private 절차의 원문은 이 문서에 복제하지 않는다. 실제 DB seed, 설치된 winning package, 모델·커널·제품 인수 상태는
[기존 runtime 보고서](../../test-reports/active/dual-client-runtime-report.md)에서 별도로 추적한다.

## Scope

최초 요청은 **이 제안서 한 파일의 검증·개선**이었고, 후속 요청에서 아래 12건의 Core 구현을 진행했다.
Must/Should는 우선순위이며, Should를 제외하지 않고 12건 모두 반영했다.
운영 DB seed, 패키지 배포·설치·실제 모델 인수는 이 문서의 Core가 아니며 별도 실행 범위로 유지한다.

포함 범위:

- `plugin/` 전체의 리뷰와 아래 채택 항목에 한정한 실제 개선.
- CLI/runtime/스킬·reference의 원본과 관련 기존 테스트.
- private runbook·공통 보고 문서와 client 공통 의미 시험.
- plugin이 소비하는 순수 정책의 기존 `packages/core` 원본.
- COH-01에 한해 같은 정책을 쓰는 기존 웹 feature facade와 동기화 시험. 다른 소비자까지 연결해야 정책 소유권을 정리할 수 있다.

구현 source bundle은 이 문서 하나다. `related`의 architecture 문서 다섯 개와 루트 `AGENTS.md`는 현재 구조·계약 제약이다.
완료된 plugin 제안서, `codex-dual-client-runtime-follow-ups.md`, `impl-verifier.md`, 기존 runtime 보고서는
이력·병행 작업의 배경 자료이며 구현 지침을 위임하지 않는다. 그 문서의 선택 기능이나 운영 실행을 이 계획에 합치지 않는다.
코드·private 템플릿·테스트·로컬 Next 가이드는 아래 inventory의 대조 근거다.

제외 범위:

- `src` 전체 재리뷰, FSD 재설계, plugin의 TypeScript 전환, 신규 의존성·프레임워크 변경.
- `plugin/lib` 직접 수정, private 본문 공개 또는 단계 본문을 공개 plugin에 동봉하는 변경.
- 서버 인가·receipt·CAS·승인 게이트 완화, DB 스키마 변경.
- Codex `impl-verifier` 활성화, 자동 watch 구현, 기존 활성 proposal의 범위 변경.
- 실제 사용자 저장소 init, 모델 호출, 운영 DB seed·배포, 패키지 공개, 커밋·PR. init 검증은 임시 저장소와 loopback fixture만 사용한다.

## Proposal

Must는 사용자 흐름이나 안전한 실행을 막는 문제, Should는 구체적인 유지·검증 비용이 있는 문제,
Consider는 작고 낮은 긴급도의 개선이다. 여러 렌즈의 동의나 하위 스킬의 HARD 표시는 심각도를 높이지 않는다.
Canonical ID는 심사 사이에 유지한다.

| 우선순위 | Canonical ID | 개선점 | 기여 렌즈 |
| --- | --- | --- | --- |
| Must | PRE-01 | 필요한 도메인 오류·제한 정보 보존 | Predictability |
| Must | TS-01 | 초기화 실패의 bridge·QA 세션 정리 | TypeScript generalist |
| Should | COH-02 | Codex 인수 실패 계약과 양쪽 의미 시험 정합화 | Cohesion, Coupling |
| Should | PRE-02 | 정상 QA 보고 파일의 인수 기대 범위 명시 | Predictability |
| Should | CPL-01 | Codex init에서 Claude 전용 파일 의존 제거 | Coupling |
| Should | PRE-03 | verifier 공급·복구 안내를 bundle 기본 경로에 맞춤 | Predictability |
| Should | PRE-04 | 사용량 cap 안내를 현재 서버 계약에 맞춤 | Predictability |
| Should | TS-02 | init 요청·본문 소비의 전체 deadline 설정 | TypeScript generalist |
| Should | COH-01 | 저장소 URL 정책의 원본 소유권 정리 | Cohesion |
| Should | READ-01 | 응답 전체와 receipt 토큰의 이름 구분 | Readability |
| Should | READ-02 | 역할 정책 영역별 predicate 명명 | Readability |
| Should | READ-03 | Win32 상수에 의미 있는 이름 부여 | Readability |

### PRE-01 · Must — 서버 도메인 오류의 이유와 제한 정보가 역할에 전달되지 않는다

기여 렌즈: **Predictability**.

- **근거:** `plugin/runtime/mcp-client.mjs:61–62`는 파싱된 실패를 일반 연결 복구 오류로 바꾼다. `plugin/runtime/codex-thread.mjs:138–142`는 다시 일반 권한·소유권 거부로 바꾼다. `packages/core/watch.mjs:42–43`는 reason만 남기고 제한 metadata를 버린다.
- **계약:** `src/server/pipeline/board-rules.ts:131–137`의 검증 선행 거부는 dev의 특별한 보류 처리에서 구별해야 한다. 소비 지침은 private `en/agents/dev.md:320–329`, `en/docs/agents/README.md:31–37`에 있다. `src/server/result.ts:5–12`에는 `USAGE_LIMIT_REACHED/resetAt`, `RATE_LIMITED/retryAfterSec`가 정의되어 있다.
- **영향:** 역할은 pre-verify 보류 예외와 다른 거부를 구분할 정보를 받지 못한다. 제한 응답에서도 실제 원인과 재시도 시간을 읽을 수 없다.
- **최소 변경:** core parser의 기존 `error.code: "access-refused"`와 `reason`을 유지하고 서버 code는 별도 `domainCode`에 둔다. 알려진 `USAGE_LIMIT_REACHED`에는 유효한 resetAt, `RATE_LIMITED`에는 유효한 retryAfterSec만 보존한다. 실패 MCP envelope·request id·필드 형식을 검증한 뒤 `mcp-client.mjs`의 구별 가능한 도메인 오류 형식으로 전달하고, bridge에서만 안전한 MCP `isError: true` 결과로 변환한다. 사본은 core에서 동기화한다.
- **완료 기준:** 정확한 pre-verify 사유와 두 제한 응답은 정보가 보존된다. 도메인 실패는 receipt/done을 갱신하지 않는다. 로컬 소유권·권한·transport·malformed protocol 실패의 일반 거부와 `RoleFileInputError`의 `-32602`는 유지한다. 다른 도메인 거부에 pre-verify 예외를 적용하지 않으며, Claude watch의 실패 분류·재시도 정책도 유지한다.

도메인 오류도 공개 전 현재 session의 active ownership과 abort 상태를 다시 확인한다. stop·소유권 상실 뒤 늦게 온 오류는 일반 거부다.
서버의 임의 JSON·stack·headers를 그대로 전달하지 않는다. reason은 기존 watch의 credential 필터를 참고해 실제 input token 및
`hs_`/`hu_`/`ho_` 형태를 차단하고 기존 cleanReason과 같은 1,000자 상한을 둔다. 안전하지 않은 reason이나 잘못된 필드 형식은 일반 오류로 닫는다.
성공 응답의 Codex runtime/protocol 검사, entry/run/receipt 바인딩 검사는 그대로 둔다.
검증은 parser뿐 아니라 실제 `callTool`과 loopback bridge 응답 body까지 연결한다.

메모리 fixture 세 가지에서 정보 소실을 확인했다. 이 결과는 실제 모델의 pre-verify 보류 동작을 재현한 증거는 아니다.

### TS-01 · Must — 역할 초기화 실패가 리소스 정리 경계 밖에서 발생한다

기여 렌즈: **TypeScript generalist**; 적용 규칙 `FN-06`, `ERR-06`.

- **근거:** `plugin/runtime/codex-thread.mjs:329–332`는 QA 세션과 listening bridge를 얻은 뒤 CLI를 탐색한다. 탐색은 `:26`, `:30`에서 실패할 수 있지만 정리 경계는 `:345` 이후다. bridge의 도구 조회·allowlist 검사(`:95–98`) 실패도 QA 세션 취득 이후다. 호출부 `plugin/bin/harness-codex.mjs:139–140`은 오류 출력과 exitCode 설정만 수행한다.
- **영향:** CLI가 없거나 지원하지 않는 wrapper이면 생성한 listener가 남아 실패한 helper가 종료되지 않을 수 있다. QA 세션 초기화 뒤 bridge 생성이 실패하면 DELETE 정리도 빠진다.
- **최소 변경:** CLI를 scratch·broker·QA·bridge 취득 전에 확인한다. `dispatchFreshRole`의 broker 취득부터 기존 실행 finally까지 하나의 정리 경계로 연결한다. bridge 취득 전 실패는 현재 소유한 최상위 fileBroker를 닫고, bridge 취득 후에는 bridge.close가 broker 정리를 소유한다. 중첩된 withQaBrowser/localFiles/commandBroker를 각각 중복 close하지 않는다.
- **완료 기준:** 누락 CLI·지원하지 않는 wrapper는 리소스를 만들지 않는다. QA 취득 후 tools/list 실패·불완전 allowlist·중복 도구, host policy 검사 실패, spawn/initialize 실패에서도 획득한 listener·QA·broker를 정리한다. 기존 turn acknowledgement, child settlement, 중지 fence, 미확인 실행의 ownership 보존 조건은 유지된다.

리소스 참조는 취득 완료 후에만 등록하고 역순으로 정리한다. 한 close 실패가 나머지 정리를 건너뛰지 않게 finally를 연결한다.
QA 초기화 자체의 실패 정리는 기존 `createQaBrowser`가 담당한다. 실제 turn을 요청한 뒤 acknowledgement가 없으면
process 종료만으로 settleChild하거나 session을 해제하지 않는다. native broker도 자기 acknowledgement 조건을 유지한다.
scratch 삭제 정책의 신설과 실행 잠금 자동 회수는 포함하지 않는다.
현재 session 시험은 `dispatchFreshRole` 초기화 실패를 직접 호출하지 않으므로, 해당 함수의 취득·실패 경로를 직접 거치는
무모델 fixture를 추가해야 한다. 함수 내부의 작은 의존성 주입 경계가 필요하면 기존 역할 정책과 production 기본 호출은 유지한다.

현재 판단은 명시적인 호출·정리 경로의 정적 근거다. 실제 CLI 실패 fixture는 구현 후 회귀 검증에 추가한다.

### COH-02 · Should — 공통 인수 실패 계약의 Codex 반영과 시험이 누락됐다

기여 렌즈: **Cohesion, Coupling**. 원시 발견 `CPL-02`를 이 canonical에 병합했다.

- **근거:** private `en/CODEX.runbook.md:156`, `:175`, `:178`에는 현재 실패 기록 호출과 acceptance 대기 분기가 없다. 비교 대상은 `en/CLAUDE.runbook.md:161`, `:163`, `:213`과 공통 `en/docs/agents/README.md:24`다. 공개 `plugin/codex/skills/harness-run/SKILL.md:62–66` 및 `docs/architecture/protocol.md:602`, `:604`와 절차가 상충한다.
- **추가 근거:** 같은 Codex 원본 `:178–180`과 서버 `src/server/pipeline/run-rules.ts:42`의 실패 안내도 대조했다. 공개 skill `:6`은 설치 runbook을 함께 읽도록 지정한다.
- **시험 공백:** private `templates.test.mjs:240–253`의 계약 시험은 Claude runbook만 검사한다. Codex 시험(`:470–475`)은 이 의미를 검사하지 않는다.
- **영향:** 같은 서버 계약을 여러 문서에서 갱신하는 과정에서 Codex 원본이 빠졌다. 함께 제공되는 skill과 runbook이 다른 실패 절차를 안내한다.
- **최소 변경:** private 원본에서 Codex를 현재 실패 기록·소유자 retry/reopen·새 accept 응답 계약에 맞춘다. 이미 전달하는 공통 reports 문서에 공통 계약의 소유권을 모으고, 각 runbook에는 필요한 분기와 참조를 유지한다. 기존 rendered 의미 시험을 client별로 구성하고, deliverable 이후의 본문에도 적용한다. 새로운 runbook 합성기를 만들지 않는다.
- **완료 기준:** 실패 기록·대기·명시적 재시도 분기가 양쪽 전달·렌더 결과에서 일치한다. runbook 파일명, protocol marker, 해시 산출 방식, 단계 delivery와 client 고유 실행 방식은 유지한다.

공통 문서가 Codex 필수 bundle에 포함되는 근거는 `packages/core/client-runtime.mjs:6`, `:30`이다.
실제 모델의 지시 선택이나 배포 DB의 template 판은 이번 리뷰에서 검증하지 않았다.

### PRE-02 · Should — 정상 QA 보고 파일을 인수 기대 증거로 명시하지 않는다

기여 렌즈: **Predictability**.

- **근거:** private `en/CODEX.runbook.md:5`, `:12–13`은 인수 전에 QA의 실제 보고 커밋을 요구하지만, 인수 파일 범위 검사(`:166–168`)에 QA 보고 파일을 추가 기대 증거로 명시하지 않는다. QA 보고 계약은 private `en/agents/qa-verifier.md:16`, `:116`에 있다.
- **정상 경로와 비교:** 공개 `plugin/bin/harness-codex.mjs:40`은 `docs/agents/qa-verifier/<KEY>.md`를 정상 workflow 파일로 인정한다. private Claude runbook(`:199–203`)에는 실행된 QA의 보고 파일 예외가 명시된다.
- **시험 공백:** private `templates.test.mjs:579–593`은 Claude 원본만 읽고 검증 역할 보고 파일 예외를 확인한다. Codex 설명 누락은 보호하지 않는다.
- **영향:** opt-in QA가 정상적으로 보고 파일을 커밋한 뒤에도 main loop가 이를 계획 밖 변경으로 오인할 수 있다. 다른 지침으로 올바르게 해석할 가능성이 있어 Should다. 실제 모델 오판과 배포 DB 판은 미검증이다.
- **최소 변경:** Codex 인수 검사에 실제 실행된 QA의 `docs/agents/qa-verifier/<KEY>.md`를 기대 증거로 명시한다. 기존 시험의 공통 QA 파일 범위 assertion만 양쪽 delivered/rendered runbook에 적용한다. Claude 전용 isolated-copy·impl-verifier 절차를 Codex에 복제하지 않는다.
- **완료 기준:** 정상 QA 보고가 추가된 경우에는 기대 파일로 설명되고, 관련 없는 계획 밖 파일은 계속 실패 대상이다. 실패 기록·대기 분기와 다른 검증 역할의 확대는 COH-02 또는 별도 proposal 범위로 유지한다.

### CPL-01 · Should — Codex init이 Claude 전용 파일의 읽기 상태에 의존한다

기여 렌즈: **Coupling**.

- **근거:** `plugin/bin/harness-init.mjs:334–341`의 `CLAUDE.md` 읽기·marker 병합은 무조건 실행된다. Codex 대상은 `:301–303`에서 분리하고 Claude 쓰기는 `:377`에서 조건부다. 기존 dual-client 시험(`plugin/bin/harness-init-dual.test.mjs:49–51`)은 정상 Claude 파일 보존만 확인한다.
- **영향:** 관련 없는 Claude 파일의 읽기 오류가 Codex init과 dry-run을 막는다. 로컬 Windows에서 디렉터리에 대한 Node 읽기는 `EISDIR`를 반환한다.
- **최소 변경:** Claude runbook 읽기·marker 검사·병합을 기존 Claude 분기에 넣는다.
- **완료 기준:** 비정상 `CLAUDE.md`를 가진 Codex 사례에서도 그 파일을 읽거나 수정하지 않고 Codex 생성·dry-run이 수행된다. Claude runbook 삽입·교체와 기존 파일 보호 동작은 유지된다.

### PRE-03 · Should — verifier의 기본 공급·복구 안내가 상충한다

기여 렌즈: **Predictability**.

- **근거:** `plugin/skills/init/SKILL.md:8–18`의 bundle 기본 공급·packaging 실패 안내와 `:78–83`의 외부 공급 안내가 상충한다. Claude reference(`plugin/skills/init/references/reconciliation-contract.md:3`, `:10`, `:37`)와 Codex reference(`plugin/codex/skills/harness-init/references/reconciliation-contract.md:3`, `:10`, `:15`, `:38`)도 외부 설치·환경 변수 경로를 기본처럼 안내한다.
- **실제 기본 경로:** `plugin/runtime/codex-agent.mjs:74–77`은 bundle을 우선 사용한다. `plugin/README.md:14–16`은 install bundle과 source-only checkout을 구분한다.
- **영향:** 정상 설치나 packaging 결함을 별도 verifier 설치가 필요한 사용자 설정 문제로 안내할 수 있다.
- **최소 변경:** 두 client의 init/reference를 bundle 기본 경로와 packaging 복구로 통일한다. Claude의 후반부 외부 공급·완료 안내도 함께 수정한다. Codex loader는 bundled directory → 명시한 HARNESS_VERIFIER_SKILL_DIR → CODEX_HOME/default skills 순이다. 뒤의 두 경로는 bundle이 없는 source-development에만 설명하고, 정상 설치 bundle의 결함을 숨기는 기본 복구로 안내하지 않는다. runtime의 fallback 동작 자체는 이 항목에서 바꾸지 않는다.
- **완료 기준:** 배포 bundle에 verifier가 없을 때 별도 Node·스킬 설치를 기본 사용자 복구로 요구하지 않는다. 기존 완전성, INV gate, checksum, winning loader 및 read-only 검증은 유지한다.

### PRE-04 · Should — Codex 사용량 cap 안내가 현재 기간과 다르다

기여 렌즈: **Predictability**.

- **근거:** private `en/CODEX.runbook.md:155`는 이전 기간을 안내한다. 현재 `packages/core/usage-window.mjs:3`은 5시간 구간이며 `src/server/result.ts:5`, `:11`에는 서버 resetAt이 있다. 공개 계약은 `docs/architecture/protocol.md:128–133`이다.
- **시험 공백:** private `templates.test.mjs:247–248`의 cap 의미 검사가 Codex rendering을 보호하지 않는다.
- **영향:** 실제 서버의 reset 시각과 다른 사용량 기간을 안내한다.
- **최소 변경:** 기간을 따로 고정해 설명하기보다 서버 reason·reset 시각과 열린 run의 재개 가능 계약을 안내한다. 같은 의미 시험을 두 runbook에 적용한다.
- **완료 기준:** Codex 안내가 현재 5시간 계약과 일치하며, 새로운 run의 제한과 기존 run 재개를 구분한다. 서버 정책 자체는 변경하지 않는다.

### TS-02 · Should — init REST 작업에 전체 완료 기한이 없다

기여 렌즈: **TypeScript generalist**; 적용 규칙 `ASYNC-05`, `ERR-06`.

- **근거:** `plugin/bin/harness-init.mjs:122`, `:170`, `:224`, `:252`, `:405`의 fetch와 이어지는 본문 소비에 전체 작업 deadline이 없다. 생성 후 runbook 보고(`:399–405`)는 best-effort 의도다. 비교 대상 `plugin/runtime/qa-browser.mjs:15`, `:57`에는 명시적인 취소 기한이 있다.
- **영향:** 데이터를 주기적으로 받지만 끝나지 않는 응답 본문이나 지연된 사후 보고가 init 반환을 오래 붙잡을 수 있다. transport의 inactivity timeout을 전체 완료 기한으로 볼 수 없다.
- **최소 변경:** 기존 MCP 요청과 같은 20,000ms를 각 REST 요청의 전체 deadline으로 둔다. signal을 fetch에 넘기고 성공 body·JSON 파싱·`responseFailure`의 오류 body 소비가 끝날 때까지 취소 범위를 유지한다. 다섯 요청 모두 적용하며 자동 재시도나 새 설정 옵션을 추가하지 않는다.
- **완료 기준:** 끝나지 않는 템플릿 body는 쓰기 전에 제한 시간 내 실패한다. 사후 runbook 보고 timeout은 기존 note 경로로 반환하고 이미 생성한 파일·lock을 보존한다. 기존 429의 종료 코드 1과 대기 안내, 401/403/409의 후속 연결 중단 안내, 다른 보고 실패의 best-effort 동작을 유지한다.

`--print-project` GET, `--register` POST, remote templates GET, TPL_DIR를 쓰는 Codex의 remote preflight GET,
Claude의 사후 runbook POST가 정확한 다섯 대상이다. 등록 POST timeout은 서버 저장 여부를 확정하지 못하므로
자동 재등록·롤백·성공 단정을 하지 않는다. 생성 전 검증 실패는 output/lock을 쓰지 않으며,
현재 init guard가 사후 보고 전에 release되는 순서를 유지한다. timeout 시험은 응답 header 뒤 계속 이어지는 body와
오류 body도 재현하고, 20초 deadline 사례의 child fixture timeout은 기존 15초보다 길게 설정한다.
20초는 요청·본문 소비의 취소 신호 기준이다. event loop 지연과 동기 JSON.parse 실행을 signal이 선점할 수는 없으므로
벽시계상 정확히 20,000ms에 반환하는 hard real-time 보장으로 설명하거나 시험하지 않는다.

모든 무응답 요청이 무한 대기한다는 주장은 하지 않는다. 로컬 Node의 기본 transport timeout과 별개로 애플리케이션 완료 기한이 없다는 문제다.

### COH-01 · Should — 저장소 URL 정책의 수정 원본이 분산되어 있다

기여 렌즈: **Cohesion**.

- **근거:** `packages/core/repo-url.mjs:8`, `:13`, `:16`, `:25`와 `src/fsd/features/create-project/model/repo-url.ts:13`, `:16`, `:25`가 같은 SEGMENT·패턴·파싱 알고리즘을 독립적으로 유지한다. core 주석도 두 파일의 동시 수정을 요구한다. plugin 호출자는 `plugin/bin/harness-init.mjs:153`이다.
- **시험 공백:** `src/server/project-slug-rule-sync.test.ts:11`, `:26`은 서버와 웹의 SEGMENT만 비교하고 core/CLI 정책은 비교하지 않는다.
- **영향:** 정책을 한쪽만 수정해도 현재 동기화 시험이 잡지 못한다. 현재 동작 차이를 발견한 것이 아니라 미래 변경 누락 위험이다.
- **최소 변경:** 기존 순수 core를 URL parser·SEGMENT 소유자로 유지한다. feature `model/repo-url.ts`는 `@harness/core/repo-url.mjs`에서 parser를 별칭 import하고 SEGMENT를 re-export하는 typed facade로 만든다. `RepoRef`, `RepoOption`, `slugFromRepo`와 기존 slice 내부 export 형식은 유지한다. core의 수동 동시 수정 주석도 새 소유권에 맞춘다.
- **완료 기준:** 같은 지원 입력과 거부 입력에 대해 CLI/core와 웹이 같은 결과를 낸다. 서버 검증 경계와 브라우저 안전성은 유지한다. plugin 사본은 기존 동기화 경로로만 갱신한다.

기존 `project-slug-rule-sync.test.ts`는 웹의 `export const SEGMENT = ...` initializer를 읽으므로 re-export 뒤 그대로 두면 실패한다.
그 시험의 SEGMENT 부분은 core SEGMENT와 server `REPO_SEGMENT`의 `.source`·`.flags` 비교로 바꾸고,
기존 SLUG_MAX_LENGTH/SLUG_RE 비교는 유지한다. server 시험에서 FSD를 runtime import하지 않는다.
server `project-slug-rule.ts`의 독립 REPO_SEGMENT는 이 제한된 변경에서 유지하되 core와의 일치를 시험으로 보호한다.
웹 시험은 facade와 core의 입력 결과 및 SEGMENT를 비교한다. 기존 `repository-entry-state`·`repository-selection`의
내부 상대 import와 `api/create-project.server.ts`의 SEGMENT import는 유지하며 slice public API를 불필요하게 확대하지 않는다.
웹의 중복 PATTERNS·정규식·파싱 구현은 제거되고 core 원본과 plugin 배포본에만 남아야 한다.
core에는 Node/server-only import가 없어야 하며, 기존 tsconfig alias·allowJs와 로컬 Next 가이드를 기준으로 type/build를 검증한다.

이 항목은 plugin이 소비하는 기존 원본과 다른 실제 소비자를 연결하는 제한된 변경이다. 웹의 파일·폴더 재설계를 제안하지 않는다.

### READ-01 · Should — receipt가 응답 전체와 내부 토큰을 모두 의미한다

기여 렌즈: **Readability**.

- **근거:** `plugin/runtime/codex-thread.mjs:65`, `:72`, `:99`, `:121`, `:132`, `:146`의 지역 receipt는 agent_next 응답 전체이고, 내부 receipt는 `{runId, revision, stepId}` 토큰이다. `receipt.receipt` 경로와 `receipt.step`을 함께 해석해야 한다.
- **영향:** outcome·report·scout 실행 바인딩을 읽을 때 응답과 토큰의 경계를 계속 추적해야 한다.
- **최소 변경:** 내부 상태·매개변수는 `stepResponse` 또는 `currentStep`, 필요한 토큰은 `stepReceipt`로 명명한다.
- **완료 기준:** 내부 이름만 바뀌며 서버 필드, bridge 반환 형식, receipt·entry·run 바인딩과 중지 동작은 유지된다.

### READ-02 · Should — 역할 정책 assertion에서 독립 계약의 경계가 보이지 않는다

기여 렌즈: **Readability**.

- **근거:** `plugin/runtime/codex-thread.mjs:224–247`의 한 assertion에 기능 제한, 역할별 shell 예외, 상속 MCP/plugin 차단, MCP 승인·인증, filesystem/network, shell 환경이 섞여 있다.
- **영향:** capability를 변경하거나 예외를 검토할 때 어떤 조건이 어떤 계약을 보호하는지 전체 조건을 재구성해야 한다. 현재 격리 실패를 주장하는 항목은 아니다.
- **최소 변경:** 같은 파일에서 정책 영역별 predicate를 명명한다. 새 전역 정책 추상화나 공통 framework를 만들지 않는다.
- **완료 기준:** 현재 fail-closed 거부와 역할별 예외가 동일하다. 특히 harness·permission 부재 시 short-circuit과 malformed config 거부를 보존한다.

### READ-03 · Should — Windows 시작 계약에 이름 없는 상수가 쓰인다

기여 렌즈: **Readability**.

- **근거:** `plugin/runtime/windows/RoleProcess.cs:78`, `:80`, `:234`, `:236`, `:251`, `:256`, `:258`에 token 정보 종류, process attribute, 생성 flag, Job flag·정보 종류가 숫자로만 표현된다. 시작 순서는 `:250–263`에서 확인된다.
- **영향:** 토큰 감사와 Job 설정이 실행 재개보다 앞선다는 계약을 검토하려면 숫자의 Win32 의미를 별도로 찾아야 한다.
- **최소 변경:** 기존 값에 대응하는 Win32 이름의 const/enum을 선언한다. 새로운 값이나 다른 native API로 바꾸지 않는다.
- **완료 기준:** 수치, P/Invoke 구조체 배치, handle 수명, suspended 생성·감사·Job 할당·Resume 순서가 동일하다. 상수 값 오류나 기존 native 격리 실패를 주장하지 않는다.

## Affected Files

경로는 공개 저장소 root 기준이다. private 경로도 부모의 `plugin/templates/` 접두사를 붙여 기록한다.
아래는 현재 존재하는 수정 대상·시험·보존 대상의 구체적인 inventory다. 신규 제품 파일·파일 이동은 요구하지 않는다.

| 수정할 원본/사본 | 심볼 또는 내용 | 관련 ID |
| --- | --- | --- |
| `packages/core/watch.mjs` | parseToolResponse의 실패 형식·허용 metadata | PRE-01 |
| `plugin/runtime/mcp-client.mjs` | callTool의 구별 가능한 안전한 도메인 오류 | PRE-01 |
| `plugin/runtime/codex-thread.mjs` | roleBridge, dispatchFreshRole, boundArguments, assertRolePolicy | PRE-01, TS-01, READ-01, READ-02 |
| `plugin/bin/harness-init.mjs` | init의 Claude 분기·다섯 fetch·responseFailure | CPL-01, TS-02 |
| `plugin/runtime/windows/RoleProcess.cs` | token/attribute/process/job 상수 이름 | READ-03 |
| `packages/core/repo-url.mjs` | SEGMENT, parseRepoUrl, 소유권 주석 | COH-01 |
| `src/fsd/features/create-project/model/repo-url.ts` | core import·re-export·typed facade | COH-01 |
| `plugin/skills/init/SKILL.md` | 기본 공급·후반부 공급·완료 안내 | PRE-03 |
| `plugin/skills/init/references/reconciliation-contract.md` | Claude bundle·source-development 안내 | PRE-03 |
| `plugin/codex/skills/harness-init/SKILL.md` | reference와 모순 없는 기본 공급 안내 | PRE-03 |
| `plugin/codex/skills/harness-init/references/reconciliation-contract.md` | Codex bundle·loader·개발 fallback 안내 | PRE-03 |
| `plugin/templates/en/CODEX.runbook.md` | 실패·대기·재시도·QA 파일·cap 안내 | COH-02, PRE-02, PRE-04 |
| `plugin/templates/en/CLAUDE.runbook.md` | 공통 reports 참조·client 고유 절차 보존 | COH-02 |
| `plugin/templates/en/docs/agents/README.md` | 공통 실패·재시도 계약의 소유 문서 | COH-02 |
| `plugin/lib/watch.mjs`, `plugin/lib/repo-url.mjs` | 원본 변경 후 sync:plugin-lib로 생성 | PRE-01, COH-01 |

`qa-browser.mjs` 자체의 lifecycle API 변경은 필수가 아니다. `withQaBrowser.close`를 획득 경계에서 호출하면 해결되는지 먼저 확인한다.
원본이 바뀌지 않은 사본과 불필요한 caller는 수정하지 않는다.

| 수정/실행할 시험의 정확한 목적지 | 추가하거나 보존할 검증 |
| --- | --- |
| `packages/core/watch.test.mjs` | 기존 access-refused shape·SSE/request id·malformed 응답 유지, 제한 metadata |
| `plugin/bin/harness-session.test.mjs` | 실제 callTool→roleBridge body, dispatchFreshRole 취득 실패, 바인딩·정책·소유권 |
| `plugin/bin/harness-qa-browser.test.mjs` | QA session DELETE·browser close·close 실패·중복 정리 방지 |
| `plugin/bin/harness-init.test.mjs`, `plugin/bin/harness-init-dual.test.mjs` | client 독립성, 다섯 요청 deadline, generated body·lock·사용자 수정 보호 |
| `plugin/templates/templates.test.mjs` | 양쪽 delivered/rendered runbook과 reports의 공통 의미; 실제 private rows를 공급하는 loopback init fixture의 생성 파일·JSON/hash; Claude 고유 시험 유지 |
| `packages/core/repo-url.test.mjs` | core 지원/거부 입력·기존 CLI 정책 |
| `src/fsd/features/create-project/model/repo-url.test.ts` | core/facade parser 결과·SEGMENT, slugFromRepo 불변 |
| `src/server/project-slug-rule-sync.test.ts` | core/server SEGMENT source·flags, 기존 slug 상수 비교 유지 |
| `src/fsd/features/create-project/model/repository-entry-state.test.ts`, `src/fsd/features/create-project/model/repository-selection.test.ts` | 기존 feature 입력·선택 흐름 |
| `src/server/project-slug-rule.test.ts`, `tests/server/project-registration.test.ts` | server owner/repo 검증과 등록 흐름 불변 |
| `plugin/bin/harness-watch.test.mjs` | Claude watch 오류 분류·중지·재시도 불변 |
| `plugin/bin/harness-role-files.test.mjs`, `plugin/bin/harness-role-commands.test.mjs`, `plugin/bin/harness-role-git.test.mjs` | native 수치·격리·Job·acknowledgement·정리 회귀 |

다음은 **읽기 전용 연결 근거·보존 대상**이다.

- 오류/인수/사용량: `src/server/result.ts`, `src/server/mcp/tools.ts`, `src/app/api/mcp/route.ts`,
  `src/server/pipeline/board-rules.ts`, `src/server/pipeline/run-rules.ts`, `packages/core/usage-window.mjs`,
  `plugin/bin/harness-codex.mjs`, `plugin/bin/harness-watch.mjs`, `plugin/codex/skills/harness-run/SKILL.md`.
- 리소스/loader: `plugin/runtime/local-session.mjs`, `plugin/runtime/file-ownership.mjs`, `plugin/runtime/role-files.mjs`,
  `plugin/runtime/role-commands.mjs`, `plugin/runtime/role-git.mjs`, `plugin/runtime/qa-browser.mjs`,
  `plugin/runtime/codex-agent.mjs`, `plugin/runtime/windows/role-process.ps1`, `plugin/README.md`.
- delivery/생성: `packages/core/client-runtime.mjs`, `packages/core/deliver.mjs`, `packages/core/vars.mjs`,
  `packages/core/render.mjs`, `packages/core/runbook.mjs`, `packages/core/manifest.mjs`,
  `src/server/client-bundle-query.ts`, `src/server/templates-query.ts`, `src/server/templates.ts`,
  `src/app/api/templates/route.ts`, `src/server/agents/steps.ts`, `src/server/agents/next.ts`,
  `plugin/templates/en/agents/dev.md`, `plugin/templates/en/agents/qa-verifier.md`.
- 웹 소비자·구성: `src/fsd/features/create-project/api/create-project.server.ts`,
  `src/fsd/features/create-project/model/repository-entry-state.ts`,
  `src/fsd/features/create-project/model/repository-selection.ts`, `src/fsd/features/create-project/ui/new-project-form.tsx`,
  `src/fsd/features/create-project/index.ts`, `src/fsd/features/create-project/index.server.ts`,
  `src/fsd/features/create-project/model/project-slug.ts`, `src/server/project-slug-rule.ts`, `src/server/project-registration.ts`,
  `package.json`, `tsconfig.json`, `next.config.mjs`.
- 검증·배포 경계: `scripts/plugin-lib.mjs`, `scripts/retired-copy.test.mjs`,
  `scripts/package-windows-plugin.mjs`, `scripts/seed-templates.ts`, `scripts/restore-dual-client-templates.ts`,
  `scripts/lib/template-seed-query.ts`, `.github/workflows/windows-role-runtime.yml`,
  `examples/apch/harness.json`, `node_modules/next/dist/docs/01-app/01-getting-started/01-installation.md`의 alias 절.

core의 public entry는 해당 `.mjs`의 named export다. 예상 연결은
`packages/core/repo-url.mjs::{SEGMENT,parseRepoUrl}` → `@harness/core/repo-url.mjs` → feature facade → 기존 내부 caller다.
plugin caller는 `../lib/repo-url.mjs`를 계속 사용한다. PRE-01 parser는 core → sync된 plugin/lib → 두 CLI/runtime 소비자의 순서다.
server가 feature facade를 import하거나 같은 layer의 다른 slice 내부를 import하는 경로를 만들지 않는다.

Filesystem preflight: 위 원본·시험 파일과 parent가 현재 존재한다. 생성 대상 `docs/harness`, `.codex/agents`, `.claude/agents`,
`CLAUDE.md`, `harness.lock.json`은 **fixture 사용자 저장소의 경로**이며 이 저장소 root에 신설하는 지시가 아니다.
기존 파일 충돌은 planWrites/lock·marker·safeTarget이 판정하고 사용자 수정 파일은 skip/refuse한다.
기존 파일의 rename/delete는 없지만 COH-01의 중복 구현 제거는 old absence와 core import의 new presence를 함께 검사한다.

공개 `harness-init-dual.test.mjs`의 rows는 합성 본문이다. client 공존·lock 검증에는 유지하되 실제 private 지침 검증으로 대체하지 않는다.
private `templates.test.mjs`에서 현재 tpl/AGENTS/COMMON_DOCS를 이용해 실제 rows를 만들고, loopback 서버가
deliverable 결과를 공급하는 disposable init을 두 client·free/pro/max에서 실행한다. 최종 runbook/reports body와
lock/package JSON을 검사한다. private 절차를 공개 시험 fixture에 복사하거나 실제 DB에 seed하지 않는다.

## Safety Analysis

확인한 경계:

- [x] 공개 CLI/runtime 진입점과 정적 import·관련 기존 시험을 근거로 확인했다.
- [x] `plugin/lib`의 core 원본과 동기화 계약을 확인했다. 직접 사본 편집을 제안하지 않는다.
- [x] private 템플릿 원본과 공개 skill, 현재 서버 계약의 연결을 확인했다. DB 배포 판은 미확인으로 남긴다.
- [x] 오류 정보·listener·QA session·역할 바인딩·중지/정리 등 런타임 side effect 경계를 명시했다.
- [x] COH-01의 웹/server 실제 소비자와 기존 비교 시험을 확인했다.

Next route, 정적 자산 URL, 브라우저 storage/analytics, DB migration은 이 제안의 변경 대상이 아니다.
코드 구현 전에는 실제 diff 기준으로 dynamic import와 새로운 호출 경로를 다시 확인해야 한다.
아키텍처 예외, 권한 확대, session 자동 회수 또는 checksum 검증 생략으로 항목을 해결하지 않는다.

## Approval

후속 요청의 “해당 문서를 바탕으로 실제 코드 수정을 진행하라”를 Core 전체의 구현 지시로 적용했다.
승인 기록은 front matter만 기준으로 사용한다. 오류 전달·정리 경계·제한된 웹 소비자 조정과 private 저장소 작업을 포함했다.
기존 proposal의 운영 seed·패키지 배포 승인 상태를 이 문서로 승계하지 않는다.

## Execution Plan

1. inventory·public/private HEAD·diff를 다시 확인하고 승인된 ID를 고정한다. 현재 architecture를 읽고 COH-01의 웹 변경 전 로컬 Next alias/TypeScript 가이드를 확인한다. 사용자 수정·다른 proposal 작업을 보존한다.
2. PRE-01: core 실패 형식의 호환성과 안전한 필드를 먼저 시험으로 고정한다. callTool의 도메인 오류와 bridge의 실패 body를 연결하고 abort/ownership·외부 바인딩·watch 분류를 보호한다. core 사본을 동기화해 실제 plugin import에서 확인한다.
3. TS-01: 직접 dispatcher 실패 fixture를 추가한다. CLI 선검증, broker 취득, bridge로의 정리 소유권 이전, spawn과 기존 turn finally 순서로 처리한다. QA/allowlist/host policy/spawn 실패와 close 실패를 검사하며 미확인 turn의 session 상태를 보존한다.
4. COH-02·PRE-02·PRE-04: private 원본과 공통 reports를 수정한다. 두 client·free/pro/max의 deliverable→rendered body에 실패 대기·owner retry·정상 QA·cap 의미 시험을 적용한다. Claude 고유 검증 절차와 서버 단계 그래프를 보존한다. private templates.test의 실제 rows→loopback delivery→init fixture 생성 파일·lock/package hash까지 검증한다.
5. CPL-01·TS-02: Claude 읽기·marker 병합을 Claude 분기로 옮기고 다섯 요청의 20초 deadline을 본문 소비까지 연결한다. Codex dry-run/정상 init, 오류 body·등록 응답 상실·사후 보고 실패·사용자 수정 보호를 검증한다. PRE-03은 네 문서의 공급·완료 안내를 실제 loader와 대조한다.
6. COH-01: core export→웹 typed facade를 연결하고 중복 구현을 없앤다. initializer 시험을 core/server 비교로 교체하고 slug 비교와 기존 caller를 유지한다. core/parser·웹·server 시험, plugin sync, type/build에서 확인한다.
7. READ-01·READ-02·READ-03: 내부 명명·영역 predicate·native 상수만 작은 diff로 변경한다. 외부 receipt 형식, short-circuit·역할별 예외, native 수치·배치·순서를 유지한다. native 검증 전제를 만족하지 못하면 해당 ID는 검증 미완료로 기록한다.
8. 아래 검증 명령과 DoD를 승인된 모든 ID에 적용한다. private 원본의 테스트 통과를 DB/설치 인수 통과로 표시하지 않는다. 실제 배포가 필요하면 별도 sourceRevision·snapshot·package 버전·winning loader 인수 계획에서 수행한다.

### Runtime behavior matrix

| 시작 상태·행동 | 기대 결과와 실패 경계 | 검증 목적지 |
| --- | --- | --- |
| active role의 검증된 domain refusal | reason·허용 metadata만 isError body에 존재, receipt/done 불변 | core watch + session의 실제 callTool/HTTP bridge fixture |
| 정확한 pre-verify refusal / 다른 refusal | 정확한 사유만 소비 지침의 특별 보류 예외, 다른 거부에 예외 없음 | session body fixture + private devSession/본문 의미 시험 |
| credential 포함 reason, malformed response, transport 실패 | 일반 거부, token·raw body·stack 미노출 | core watch + session 음성 fixture |
| stop 또는 ownership 상실 중 늦은 결과/오류 | abort·현재 ownership 검사로 노출/바인딩 차단 | session의 대기 응답 fixture |
| CLI 부재/지원하지 않는 wrapper | broker·QA·listener 취득 전 종료 | session의 직접 dispatcher fixture |
| QA 취득 뒤 bridge inventory/allowlist 실패 | acquired 최상위 broker close, session DELETE, listener 없음 | session + qa-browser lifecycle fixture |
| bridge 취득 뒤 policy/spawn/initialize 실패, close 실패 | 남은 리소스 정리, 정리 중 오류에도 뒤 정리 시도 | session 직접 dispatcher fixture |
| 요청한 turn의 acknowledgement 부재 | process 종료만으로 settle/release하지 않음 | session 상태 + native child acknowledgement 시험 |
| 새 accept / 실패 / acceptance wait / owner retry | 5개 검사 후 실패 기록, 대기 중 임의 재검사·reopen 없음, owner 조치 후 새 응답 조회 | 양쪽 delivered/rendered runbook·reports 의미 시험 |
| 실제 QA 보고 존재 / 관련 없는 계획 밖 파일 | QA 보고만 추가 기대 파일, 나머지 거부 유지 | 양쪽 rendered 파일 범위 시험 + init generated body |
| cap에 걸린 새 run / 이미 열린 run | 서버 reason/resetAt 안내, 기존 run 재개 계약 유지 | 양쪽 rendered cap 의미 시험 |
| Codex init + 비정상 CLAUDE.md | 파일 읽기·병합·쓰기 없이 정상 생성 또는 dry-run | init-dual fixture; Claude marker 보존도 함께 검사 |
| 다섯 REST 요청의 지연 header/body/error body | 요청·body 소비에 20초 취소 신호, 생성 전 output/lock 없음; scheduler 허용 오차와 충분한 child timeout | init의 loopback HTTP·stream fixture |
| 등록 POST가 저장 후 응답 timeout | 저장 여부 미확정 안내, 자동 retry/rollback 없음 | init fixture의 POST 횟수와 output 검사 |
| 생성 후 runbook 보고 timeout/429/401·403·409 | 파일·lock 보존, 기존 note·종료 코드·중단 안내 유지 | init fixture의 실제 파일·exit·출력 |
| core URL 정책 / 웹 입력·server 검증 | 지원/거부 입력 일치, alias 브라우저 안전·FSD 경계 유지 | core/web/server 시험 + lint/type/build |
| 기존 receipt·정책·Windows 시작 흐름 | 외부 형식·lazy 거부·역할 예외·native 값/순서 불변 | session + role-files/commands/git 시험 |

### Final artifact resolution map

| 최종 노출 대상 | winning 원본·우선순위·본문 의존성 | 실제 검사 목적지 |
| --- | --- | --- |
| 역할의 MCP 실패 응답 body | server failureBody→MCP isError→core parser→sync된 lib→callTool→roleBridge; 로컬 거부와 credential 필터가 우선 | session loopback HTTP 응답 JSON의 result.isError/content 또는 기존 error code |
| Codex runbook `docs/harness/codex-runbook.md` | remote DB bundle 또는 명시한 TPL_DIR 원본→deliverable(client/plan)→buildVars/renderTemplate; Codex local mode도 remote runtime/hash preflight 필요 | private templates.test의 실제 rows 기반 init 최종 body, reports 참조·공통 문서 존재, 미치환 없음 |
| Claude `CLAUDE.md` managed block | 같은 delivery/render 경로→START/END marker 병합; marker 밖 사용자 본문 보존 | private templates.test의 실제 rows 기반 merged block; init-dual의 block 밖 바이트와 Codex 읽기/쓰기 부재 |
| 공통 `docs/agents/README.md` | private 공통 reports→COMMON_DOCS→deliverable→client별 vars/render; 양쪽 runbook의 참조 대상 | 양쪽 client·free/pro/max의 delivered/rendered 본문 및 init 생성물 |
| `.codex/agents/*.toml`, `.claude/agents/*.md` | entitled 역할만 전달, 단계 본문은 stub으로 축소; workspace dev 변형은 buildWorkspaceVars; Codex는 renderCodexRole | 기존 templates/role parser 시험·init 생성 파일; 단계 본문 유출 없음 |
| `harness.lock.json`, `docs/harness/codex-package.json` | 원문 LF 정규화 runbook hash 12자리, manifest.hashOf 생성 body hash 16자리; lock은 다른 client와 수정 파일의 hash 보존; Codex metadata는 verifier path/checksum 포함 | JSON 구조 검사·실제 생성 body의 hash 비교·다른 client lock 항목 보존 |
| init skill/reference와 verifier dependency | packaging이 공개 tracked plugin(templates·test 제외)을 복사하고 verifier 전체를 `skills/`와 `codex/skills/`에 포함; Codex loader는 bundle 우선, global/env는 bundle 없는 개발 경로 | 네 문서의 전체 지침·실제 codex-agent loader와 대조; 배포 시 package inventory와 실제 skills/list를 별도 확인 |
| plugin 정책 배포본 | packages/core 원본→scripts/plugin-lib.mjs→plugin/lib; 수동 사본 편집 없음 | sync --check의 바이트 비교 및 실제 plugin import 시험 |
| 웹 URL facade | core named export→tsconfig alias→feature facade→기존 caller; core에 Node/server-only dependency 없음 | facade import·중복 구현 부재, core/web/server 결과·lint/type/build |
| Windows 실행 helper | RoleProcess.cs→role-process.ps1의 실제 Add-Type 경로; 모든 값·배치·suspended→audit→Job→Resume 순서 보존 | native role-commands/files/git 시험의 실제 child·Job·정리 acknowledgement |

운영 DB row나 설치 package를 관찰하지 않았다. 이 표는 winning **경로와 검사 위치**를 확정하며 현재 배포 body를 통과로 판정하지 않는다.
source-only 원본 변경이 installed skill을 자동 갱신하지 않으므로 PRE-03 배포 주장은 실제 package 검사 뒤에만 한다.
사용자 수정 runbook/reports가 skip되면 전달된 새 원본과 다른 상태다. 해당 경로·hash를 보고하고 완료를 단정하지 않는다.

## Verification Plan

다음 명령은 **구현 전 확정한 회귀 검증 계획**이다. 문서 정합화 당시 결과와 실제 구현 후 결과는 아래에서 구분한다.

```powershell
node --test plugin/bin/harness-init.test.mjs plugin/bin/harness-init-dual.test.mjs
node --test packages/core/watch.test.mjs packages/core/repo-url.test.mjs plugin/bin/harness-session.test.mjs plugin/bin/harness-qa-browser.test.mjs plugin/bin/harness-watch.test.mjs
node --test plugin/bin/harness-role-files.test.mjs plugin/bin/harness-role-commands.test.mjs plugin/bin/harness-role-git.test.mjs
npm run test:templates
npm test
npm run test:web
npm run test:server
npm run verify:fsd
npm run test:architecture
npm run lint
npm run check
npm run build
```

위 명령은 repo root의 PowerShell에서 실행한다. 각 명령의 exit code를 확인하고 실패한 뒤 다음 검사를 성공으로 합산하지 않는다.
`test:templates`에는 private checkout·tsx·과거 graph 기준 commit이 필요하다. private checkout이 없으면 skip 통과로 대체하지 않는다.
`check`는 sync 검사·lint·Next typegen·tsc·architecture·availability 계약 검사까지 포함한다.
core 수정 후에는 `npm run sync:plugin-lib`를 먼저 실행하고 `node scripts/plugin-lib.mjs --check`를 실행한다.
`test:web`는 src의 facade·입력 흐름과 server/MCP 단위 시험을 실행한다. `test:server`는 tests/server의 등록·바인딩 등 회귀를 실행한다.
COH-01 구현 검증에서 둘 다 생략하지 않는다. 루트 dependencies와 생성된 Prisma client 등 기존 개발 준비가 필요하며,
준비 실패를 정책 시험 통과로 바꾸지 않는다. DB integration 명령은 이 Core의 기본 검증에 추가하지 않는다.

READ-03 또는 native 정리 경계 변경 시에는 실제 Windows의 기존 native 회귀가 필요하다.
`.github/workflows/windows-role-runtime.yml`의 runtime-cache integrity 검사를 통과한 runtime 경로를
`STAGEKEEPER_TEST_WINDOWS_RUNTIME`에 설정해 위 role 시험을 실행하고 native case가 실제로 실행됐는지 결과를 확인한다.
이 경로는 준비된 runtime의 실제 경로이며 `<path>` 문자열이나 임의 host Node를 넣는 지시가 아니다.
native skip, source fixture, host build 통과를 실제 설치·모델·제품 인수 통과로 표시하지 않는다.

| ID | 추가로 확인할 행동 |
| --- | --- |
| PRE-01 | parser→실제 callTool→HTTP bridge body; access-refused 호환·제한 필드; credential/malformed/abort·소유권 상실·다른 거부 음성 사례 |
| TS-01 | dispatcher 직접 경유 CLI/QA/allowlist/policy/spawn 실패; close 실패 후 나머지 정리; 중복 close 없음·미확인 turn 잠금 보존 |
| COH-02 | 양쪽 runbook의 실패 기록·대기·owner 재시도와 새 응답 재조회 |
| PRE-02 | 정상 QA 보고 파일을 기대 증거로 인정하는 설명; 관련 없는 계획 밖 파일의 거부 설명 유지 |
| CPL-01 | 비정상 Claude 파일을 가진 Codex init/dry-run; 기존 Claude 생성물 보호 |
| PRE-03 | 네 문서의 bundle·packaging 복구·완료 안내와 loader precedence; 외부 설치를 기본으로 지시하는 모순 제거 |
| PRE-04 | 실제 서버 resetAt 안내와 기존 run 재개; 양쪽 runbook 의미 검사 |
| TS-02 | 다섯 endpoint별 header/body/error body deadline; 등록 결과 미확정·사후 보고 파일 보존·인증/429; child timeout 전제 |
| COH-01 | core import 존재·웹 중복 PATTERNS/parser 부재; core/web/server SEGMENT source·flags와 지원/거부 입력; slug/caller 불변 |
| READ-01 | 외부 receipt 반환·entry/run/outcome/scout 바인딩 불변 |
| READ-02 | 누락·malformed config·상속 도구·역할별 shell 예외의 기존 거부/허용 불변 |
| READ-03 | native 상수 값·구조체 배치·suspended 시작/감사/Job/Resume 순서 불변 |

구현 전후 같은 준비 환경에서 결과를 비교한다. 실패가 생기면 기존 재현인지 새 diff의 회귀인지 분리한다.
정합화에서는 아래 기록한 기존 fixture 시험만 실행했다. 전체 lint/type/build 또는 향후 추가할 회귀 사례의 통과를 주장하지 않는다.

### Definition of Done

- 승인된 ID 모두 해당 원본·시험·runtime matrix·최종 artifact 검사에 연결되고, 다른 ID를 암묵적으로 제외하지 않는다.
- PRE-01은 안전한 도메인 실패 body와 일반 로컬 거부를 구분하며 watch·runtime/protocol·receipt/entry/run 계약을 보존한다.
- TS-01은 부분 취득 실패의 리소스를 정리하고 미확인 turn·native acknowledgement의 ownership을 유지한다.
- 다섯 REST 요청의 20초 완료 기한, Codex의 Claude 파일 독립성, 기존 충돌/modified-file/lock/marker 보호를 검증한다.
- 양쪽 delivered/rendered 및 실제 생성 runbook/reports에서 공통 계약을 확인하고 final body·의존 파일·metadata hash를 검사한다.
- COH-01의 import provenance·중복 제거·server 비교 시험·browser 안전성, READ 항목의 외부 계약·native 값/순서를 확인한다.
- 관련 시험·FSD·architecture·lint·type·build가 통과한다. native case skip 또는 준비 실패는 해당 항목 미완료다.
- 운영 seed·패키지/manifest 버전·설치된 winning loader·실제 모델/제품 인수는 별도 상태로 기록한다. 이번 구현 완료로 대체하지 않는다.

## Verification Results

### 리뷰 중 근거 확인

| 확인 | 결과 | 한계 |
| --- | --- | --- |
| 전체 파일 inventory 및 독립 렌즈 검토 | 69/69, 다섯 렌즈 Applicable | `.git` 내부 제외; 작업 파일 기준 |
| `node scripts/plugin-lib.mjs --check` | Passed, `plugin/lib in sync` | 정책 자체의 정당성을 증명하는 검사는 아님 |
| Node 메모리 MCP fixture: domain refusal·usage limit·rate limit | 세 경우 모두 reason이 callTool에서 소실; 제한 metadata는 parser에서 소실 | fetch를 교체한 무네트워크·무쓰기 관찰; 실제 모델 동작 미검증 |
| Windows에서 Node의 디렉터리 읽기 | `EISDIR` 확인 | Codex 전체 init 재현 시험은 미실행 |
| 중립 품질 심사 | 두 차례 심사 완료: raw 직접 수락 12, 병합 수락 1 → canonical 12 | 미해결 수정 요청·pending verification·판단 충돌 없음 |
| 문서 자체의 Node 읽기 전용 검사 | Passed: metadata·필수 섹션·12개 ID·Must 2/Should 10·13개 처분·링크 경로·code fence·공백 확인 | 애플리케이션 회귀 검증과 별개 |

MCP fixture는 기존 `callTool`과 `parseToolResponse`를 import한 Node `--input-type=module`에서 수행했다.
메모리의 JSON-RPC 응답만 사용했고 token도 가짜 값이었다. 관찰한 입력은 일반 domain refusal,
`USAGE_LIMIT_REACHED/resetAt`, `RATE_LIMITED/retryAfterSec`다.
세 경우 모두 parser에는 reason이 있었지만 adapter에는 `access-refused` 및 일반 init 복구 안내만 남았다.
이 확인은 PRE-01의 정보 소실을 뒷받침하며, 서버 전이를 실제 실행한 결과는 아니다.

### 구현 후 회귀 검증

후속 구현 요청에 따라 `harness/plugin-clean-code`에서 다음 항목을 완료했다. 공개·private 기준 HEAD는 Current State와 같고,
수정은 아직 커밋하지 않은 작업 파일에 있다. 기존 사용자 문서 `core-clean-code-improvements.md`는 수정하지 않았다.

| Canonical ID | 실제 반영과 검증 |
| --- | --- |
| PRE-01 | core parser의 `access-refused` 호환성을 유지하고 검증한 제한 metadata만 추가했다. `callTool`의 안전한 도메인 실패를 실제 HTTP bridge로 전달하며 credential·malformed·abort·소유권 상실과 receipt/done 보존을 시험했다. |
| TS-01 | CLI 선검증 및 전체 취득 경계의 finally를 적용했다. broker→bridge 정리 소유권 이전, 17개 직접 dispatcher 실패 사례, QA session DELETE, close 실패 후 남은 정리, 미확인 turn의 ownership 보존을 시험했다. |
| COH-02 | 양쪽 private runbook과 공통 reports의 실패 기록·대기·owner retry/reopen·새 응답 재조회 계약을 맞추고 두 client×세 plan의 의미·실제 생성물 시험을 추가했다. |
| PRE-02 | 실제 실행한 QA 보고 파일을 인수 기대 증거에 포함했다. 관련 없는 계획 밖 파일의 거부와 Claude 고유 검증 절차를 유지했다. |
| CPL-01 | `CLAUDE.md` 읽기·marker 병합을 Claude 분기 안으로 옮겼다. 비정상 Claude 파일을 가진 Codex init·dry-run과 기존 생성물 보호 시험이 통과했다. |
| PRE-03 | 네 skill/reference 문서의 공급·복구·완료 안내를 bundle 기본 경로와 실제 loader precedence에 맞췄다. source fallback과 설치된 winning package의 확인을 구분했다. |
| PRE-04 | Codex cap 안내를 서버 reason/resetAt과 기존 열린 run 재개 계약에 맞추고 양쪽 rendered/생성 runbook에서 확인했다. |
| TS-02 | 다섯 REST fetch에 20초 취소 신호를 적용했다. 지연 header·소비 body·오류 body, 등록 결과 미확정, 자동 재시도 부재, 생성 후 보고 실패의 파일·lock 보존을 시험했다. 소비하지 않는 정상 보고 body는 즉시 cancel한다. |
| COH-01 | 순수 core parser→기존 typed web facade로 연결했다. 중복 parser를 제거하고 core/server의 SEGMENT source·flags, 웹 입력·slug·기존 caller, 브라우저 build와 FSD 경계를 확인했다. |
| READ-01 | 응답 전체는 stepResponse, 내부 토큰은 stepReceipt로 구분했다. 외부 receipt/entry/run/outcome/scout/report 바인딩 시험을 유지했다. |
| READ-02 | 역할 정책을 lazy 영역 predicate 다섯 개로 나눴다. 상속 도구·권한·shell·malformed policy의 fail-closed 거부와 역할별 예외를 유지했다. |
| READ-03 | Win32 상수에 이름을 부여하고 수치·구조체 배치·suspended→audit→Job→Resume 순서를 유지했다. 실제 Windows native 회귀 35개가 skip 없이 통과했다. |

다음 결과는 변경 후 실제 명령의 exit code 0을 확인한 기록이다. 중복 실행되는 시험 수는 합산하지 않는다.

| 실행 명령·범위 | 실제 결과 | 한계·skip 설명 |
| --- | --- | --- |
| `npm run sync:plugin-lib` 및 `node scripts/plugin-lib.mjs --check` | 2개 사본 동기화, `plugin/lib in sync` | core 원본을 수정한 뒤 생성; 사본을 직접 편집하지 않음 |
| init/init-dual 두 파일 | 77 passed, 0 failed, 0 skipped | 실제 20초 HTTP/stream fixture 및 임시 Git 저장소; 사용자 저장소를 초기화하지 않음 |
| core watch/repo-url + session/qa-browser 네 파일 | 96 passed, 0 failed, 1 skipped | 최종 코드 재실행; POSIX 전용 shell 시험은 Windows에서 skip |
| `npm run test:templates` | 59 passed, 0 failed, 0 skipped | 실제 private rows→delivery/render→init 파일·managed block·공통 문서·lock/hash·Codex metadata; DB 배포판·설치 인수 아님 |
| Windows role-files/commands/git 세 파일 | 35 passed, 0 failed, 0 skipped | 아래 integrity 검증 runtime을 사용한 실제 child/Job 회귀; 실제 모델·제품 인수 아님 |
| `npm test` | 368 passed, 0 failed, 2 skipped | POSIX shell 및 runtime env 전용 preflight가 기본 실행에서 skip; 후자는 위 native 실행에서 통과 |
| `npm run test:web` | 585 passed, 0 failed, 0 skipped | URL facade 및 기존 src 회귀 |
| `npm run test:server` | 55 passed, 0 failed, 1 skipped | post-build opt-in inbox manifest 시험은 기본 실행에서 skip |
| fresh build 뒤 `SRC_CHECK_INBOX_MANIFEST=true`로 inbox-card-boundary 실행 | 4 passed, 0 failed, 0 skipped | 기본 server 실행에서 skip한 manifest를 실제 build 산출물로 확인 |
| `npm run verify:fsd` | Passed | 아키텍처 예외 없음 |
| `npm run test:architecture` | 44 passed, 0 failed, 2 skipped | LPAC readlink/IPC의 별도 snapshot 환경 시험은 skip; native 35개와 다른 범위 |
| `npm run check` | Passed | sync, lint/FSD, Next typegen, tsc, architecture, project-availability 18 passed 포함 |
| `npm run build` | Passed | Prisma generate 및 Next production build 성공 |
| 공개·private `git diff --check` | Passed | 별도 private diff도 확인 |

Windows runtime은 `scripts/windows-role-runtime-cache.mjs verify --runtime`가 통과한
`C:/Users/hamso/AppData/Local/Temp/stagekeeper-ci-runtime-validation`을 `STAGEKEEPER_TEST_WINDOWS_RUNTIME`에 지정했다.
package SHA-256은 `ae08b7bc24d529325068edf465bf5ed549d22fd9a804310e18dbe09e79f883c9`, 실행 파일 SHA-256은
`c5f2967a9b5ccdb33cbaaaf0da78d0f7c2a87c448602dd67060c6d6b4e7a158d`이며 2,150 files·98,598,361 bytes를 확인했다.
임의 host Node나 native skip을 이 검증으로 대체하지 않았다.

구현 후 review는 **Full applicable-lens review**다. Cohesion·Coupling·Predictability·Readability·TypeScript generalist가 각각
격리 문맥에서 변경 파일 전체를 읽었고 모두 `No supported findings from this lens.`를 반환했다.
중립 게이트의 1차 심사에서 다섯 Applicable/Completed 및 20 public·4 private 범위를 확인했다.
추가 raw/canonical 발견, revise, pending-verification, 거부, 충돌, human judgment는 없다. N/A·Unavailable·Skipped 렌즈도 없다.
추가 발견을 판정하기 위한 review-mode substantiation은 필요하지 않았다. 위 명령은 구현 후 regression 검증이다.

운영 DB seed·package 배포·winning installed loader·실제 모델/제품 인수는 실행하지 않았다.
private 원본·fixture 생성물·Windows 회귀 통과를 이 운영 상태의 통과로 표시하지 않는다.

### 코드베이스 정합화에서 확인한 현재 기준선

| 실행한 기존 검사 | 결과 | 해석 |
| --- | --- | --- |
| core watch/repo-url + plugin session/qa-browser 4개 파일 | 74 tests: 73 passed, 1 skipped, 0 failed | 현재 구현의 경계 fixture; skip은 실제 격리 실행 증거가 아님 |
| init/init-dual 2개 파일 | 73 passed, 0 failed | disposable init의 기존 생성·보호 계약; 새 deadline/dispatcher 실패 회귀는 아직 없음 |
| `npm run test:templates` | 53 passed, 0 failed | private 원본의 현재 시험; Codex 공통 의미 공백이 있어 녹색만으로 정합성을 증명하지 못함 |

이 결과는 기존 코드의 기준선이며 12개 개선 구현이 완료됐다는 증거가 아니다.

## Reconciliation Notes

이 절과 마지막 Reconciliation Evidence Manifest는 **구현 전 문서 정합화 이력**이다.
구현 후 코드·private 본문이 변경됐으므로 당시 replay hash와 clean status를 현재 코드의 검증 결과로 승계하지 않는다.

첫 검증은 편집 없는 clean pass가 아니었다. 다음 제안서 결함을 묶어 해결했다.

| 제안서의 초기 문제 | 문서에 반영한 해결 | 전파 위치 |
| --- | --- | --- |
| 오류 전달을 바꾸면서 parser/watch 호환성·공개 조건이 불명확 | access-refused 유지·domainCode 분리·안전한 reason·ownership/abort·receipt 불변 | PRE-01, inventory, runtime/artifact map, 검증, DoD |
| dispatcher의 부분 취득·close 실패·정리 소유권과 직접 시험 공백 | CLI 선검증·최상위 broker/bridge 소유권·finally 순서·직접 dispatcher fixture | TS-01, 실행 순서, runtime/artifact map, 검증, DoD |
| shared URL facade 이동이 initializer 시험을 깨뜨리고 import 경로가 불명확 | core named export/alias/facade, server 비교 시험 교체·slug/caller 유지 | COH-01, inventory, 실행·검증, artifact map, DoD |
| raw/render 검사만 있고 winning 생성 body·hash·skip 상태 검사 부족 | delivery→vars/render→managed body→JSON/hash 검사, 사용자 수정·DB/설치 별도 상태 | COH-02/PRE-02/PRE-04, inventory, artifact map, 검증, DoD |
| timeout 대상·오류 body·등록 결과·사후 보고 종료 동작 불명확 | 다섯 요청·20초·본문까지 signal·기존 status/exit·등록 미확정·guard release 유지 | TS-02, 실행·runtime·검증, DoD |
| 공급 안내·client 고유 시험·검증 준비 조건의 범위가 넓고 모호 | 네 문서, bundle precedence, 공통 QA assertion만 확대, private/native 준비 전제 | PRE-02/PRE-03, inventory, artifact·검증, scope guard |
| proposal 상태·source bundle·완료 조건과 결과가 혼재 | 문서만 수정, 12개 Core 후보·배경 자료 구분, 기존 검사/향후 검증 구분 | Summary, Scope, Approval, Results, DoD |

편집 후 대조에서 합성 init fixture와 실제 private 본문을 구분하고, private 시험에 최종 생성 파일 검증을 배정했다.
deadline은 취소 신호 기준으로 표현했으며, Core 완료 조건에서 별도 배포 실행을 요구하는 문구도 정리했다.

이력: 편집 pass에서 readiness는 `clean pass not completed`로 초기화된다.
저장된 최신 문서에 대한 INV-1..INV-6 재검증, coverage stability 및 INV-7의 **무편집 최종 pass** 결과는 최종 응답에 기록한다.
재검증 중 문서가 다시 바뀌면 이전 결과를 승계하지 않는다. 설치·DB·모델 인수의 미실행은 유지되며 제안서 정합화 결과로 대체하지 않는다.

## Review Coverage

**Full applicable-lens review**: 다섯 렌즈 모두 전체 69개 파일을 검토했다.

| 렌즈 | 상태 | 적용 범위 |
| --- | --- | --- |
| Cohesion | Completed | 공유 입력 정책·client 공통 계약의 소유권과 변경 누락 |
| Coupling | Completed | client별 의존성과 공통 계약 변경의 검증 범위 |
| Predictability | Completed | 실패 응답, 복구·인수·사용량·verifier 안내의 실제 의미 |
| Readability | Completed | 응답/토큰 명명, 정책 조건의 경계, native 상수 문맥 |
| TypeScript generalist | Completed | 전체 규칙 범위를 검토하고 native 코드에 적용되는 함수·오류·비동기·검증 규칙 사용 |

React 전용 hook·JSX·Suspense·RSC 패턴은 이 native plugin에 적용하지 않았다.
전체 렌즈를 N/A로 처리한 것은 아니다. Gate-validated N/A, Unavailable, Skipped는 없다.
채택 기여가 없는 적용 렌즈도 없다. Needs human judgment 항목은 없다.

### 최종 원시 발견–canonical 추적

| Raw ID | 렌즈 | 최종 처분 | Canonical ID | 최종 심각도 | 판단 근거 |
| --- | --- | --- | --- | --- | --- |
| COH-01 | Cohesion | accept | COH-01 | Should | 정책 소유권 분산과 비교 시험의 core 누락 |
| COH-02 | Cohesion | accept | COH-02 | Should | Codex 인수 실패 계약·의미 시험 누락 |
| CPL-01 | Coupling | accept | CPL-01 | Should | Codex init의 무조건적인 Claude 파일 읽기 |
| CPL-02 | Coupling | merge-accept(COH-02) | COH-02 | Should | 인수 실패 범위로 좁힌 뒤 같은 원인·호환되는 최소 변경 확인 |
| PRE-01 | Predictability | accept | PRE-01 | Must | reason·제한 metadata 소실과 역할 소비 계약 |
| PRE-02 | Predictability | accept | PRE-02 | Should | QA 기대 파일로 좁히고 오판 가능성으로 한정 |
| PRE-03 | Predictability | accept | PRE-03 | Should | verifier bundle 공급·외부 복구 선언 충돌 |
| PRE-04 | Predictability | accept | PRE-04 | Should | 이전 기간 안내와 현재 서버 계약 불일치 |
| READ-01 | Readability | accept | READ-01 | Should | 응답과 토큰 의미 혼용의 해석 비용 |
| READ-02 | Readability | accept | READ-02 | Should | 독립된 정책 계약의 무명 조건 혼재 |
| READ-03 | Readability | accept | READ-03 | Should | native 시작 계약을 읽기 위한 외부 상수 문맥 |
| TS-01 | TypeScript generalist | accept | TS-01 | Must | 리소스 취득 후 실패가 cleanup 경계 밖에 존재 |
| TS-02 | TypeScript generalist | accept | TS-02 | Should | 요청·본문 소비 전체 deadline 부재 |

1차에서는 11건을 직접 수락하고 복합 raw 두 건을 원래 렌즈에만 돌려보냈다.
2차에서 CPL-02의 사용량 부분을 제거한 수정본은 COH-02로 병합했고,
PRE-02의 인수 실패 부분을 제거한 수정본은 QA 파일 범위에 한정해 Should로 수락했다.
사용량은 PRE-04, 인수 실패는 COH-02에 각각 남아 있다. 모든 canonical ID는 심사 사이에 유지했다.

## Risks and Rollback

- PRE-01에서 검증하지 않은 arbitrary 오류를 전달하면 credential 또는 내부 상태가 노출될 수 있다. 허용 필드와 도메인 실패 경계를 좁게 유지한다.
- TS-01을 처리하면서 process 종료를 turn 완료로 간주하면 ownership을 잘못 반납할 수 있다. 기존 acknowledgement와 미확인 상태 보존이 우선이다.
- READ-02의 predicate 추출은 누락 객체의 short-circuit을 바꿀 수 있다. 기존 거부 사례와 평가 순서를 보호한다.
- 20초 deadline은 느린 정상 응답을 거부할 수 있다. 정상·지연·stream fixture로 동작을 확인하고, 값 변경이 필요하면 계획과 회귀 기준을 함께 갱신한다. 사후 보고 실패 때문에 이미 쓴 파일을 되돌리지 않는다.
- private 원본 수정만으로 DB와 설치 package가 갱신되지는 않는다. 템플릿 seed·hash·양쪽 manifest 버전·winning loader 인수는 별도 실행 상태로 남긴다.
- COH-01은 plugin 외부의 실제 소비자를 조정한다. 현재 지원 입력과 typed facade의 브라우저 안전성을 검증하고 새 FSD 경계를 만들지 않는다.

롤백은 항목별 공개 코드 commit과 private 템플릿 commit을 각각 revert한다.
core를 되돌리면 배포 사본도 원본 기준으로 다시 동기화한다.
향후 DB seed 또는 install bundle 배포까지 진행했다면 보관한 이전 template snapshot과 이전 버전 package의 별도 복구 절차가 필요하다.
사용자 generated 파일을 `--adopt`로 덮거나 실행 잠금을 자동 회수하는 방법을 롤백으로 사용하지 않는다.

## Completion or Closure Notes

승인된 12개 ID의 Core 구현·회귀 검증을 완료했다. `docs/proposals/README.md`의 lifecycle 규칙에 따라
`completed/2026-10-10-plugin-clean-code-findings.md`로 이동하고 승인·완료 metadata를 갱신했다.
코드·private 템플릿은 작업 파일에 반영했으며 커밋·PR은 만들지 않았다. 운영 seed·패키지 배포·설치 인수는 별도 실행 범위다.

구현 검증 snapshot은 공개 변경 20개와 private 변경 4개를 상대 경로로 합쳐 JavaScript 기본 정렬한 24개 파일이다.
경로를 LF로 연결한 UTF-8 SHA-256은 `6e01e2b4b2eed39feb3244adff16379d0d2b996ee2341bdc04ddcbdfbdcb497a`,
동일 순서의 `[relativePath, SHA256(fileBytes)]` 배열을 JSON.stringify한 UTF-8 SHA-256은
`556d4e4038bc1174c5ebf9c17d3e267b295476389b76e68a409cac1b2c571487`이다. 이 문서와 무관한 사용자 문서는 포함하지 않았다.
이는 이번 작업 파일·검증 대상의 식별값이며 향후 다른 변경이나 CRLF 변환을 포함한 상태까지 검증하는 값은 아니다.

## Review Checklist

- [x] 전체 대상, 기준 commit, 원본·사본·private 저장소 경계를 기록했다.
- [x] 개선 항목을 현재 파일·행 근거와 최소 변경·완료 기준에 연결했다.
- [x] 실제 근거 확인과 구현 후 회귀 검증 계획을 구분했다.
- [x] 승인 기록, 영향 범위, 위험과 롤백을 템플릿 기준으로 작성했다.
- [x] 두 복합 raw의 originating-lens 수정과 최종 품질 심사를 반영했다.
- [x] 정합화 첫 검증에서 제안서에 개선할 점이 있었음을 기록하고 코드 발견 12건과 구분했다.
- [x] 원본/export/import/시험 목적지, 부분 실패, final body·JSON/hash, 보존 동작과 완료 조건을 계획에 연결했다.
- [x] 기존 fixture 기준선과 추가할 회귀·운영/설치 인수의 미실행을 구분했다.
- [x] 코드 구현 승인과 실제 구현·회귀 검증을 완료했다.


## Reconciliation Evidence Manifest

이 기록은 **구현 전 정합화 pass의 historical bounded evidence**다. 당시 제안서의 전체 SHA-256과 무편집 pass는
당시 최종 응답의 Minimal Replay Anchor로 확정했다. 아래 hash는 구현 전 파일의 값이며 현재 구현과 일치한다고 주장하지 않는다.
구현 검증 대상은 위 Completion의 snapshot을 따른다. hash 일치는 적용 근거의 동일성을 뜻하며 완전성·정확성·결함 부재를 증명하지 않는다.

- 저장소 identity: `f7df32898cc5a300`; 공개 HEAD: `6d16410487c4a4ff5e991ee5024e44f9fb9b4ec5`.
- private HEAD: `405ca54a31653058188b372b459292f1d07d88d3`; 구현 전 공개 HEAD 외 근거의 개별 SHA-256은 아래에 있다.
- 구현 source: 이 제안서. 제약 source: `AGENTS.md`와 Scope에서 명시한 architecture 다섯 문서. phase: 문서 정합화; profile: High-Risk.
- risk-sensitive anchors: parseToolResponse/callTool/roleBridge, dispatchFreshRole/settleChild, init의 다섯 REST 호출,
  deliverable/renderTemplate/manifest.hashOf, core→웹 facade import, verifier loader precedence, Windows Add-Type/Job/acknowledgement.

Candidate closure의 정확한 규칙(D1):

1. `rg --files --hidden --no-ignore -g '!.git' plugin packages/core src/fsd/features/create-project`의 모든 파일을 포함한다.
2. 이 제안서의 backtick 안에서 다음 정규식의 group 1과 일치하는, 실제 존재하는 파일을 포함한다. glob 또는 `<`가 있는 값은 생성물 표기의 의미만 검사한다.
3. `AGENTS.md`, Scope의 architecture 다섯 파일, 이 제안서, `package.json`, `tsconfig.json`, `next.config.mjs`,
   `package-lock.json`, `node_modules/next/package.json`을 추가한다.
4. Windows 역슬래시를 슬래시로 정규화하고 중복 제거·JavaScript 기본 정렬한다. 경로를 LF로 연결한 UTF-8 값의 SHA-256이 path-set signature다.
   content-set signature는 같은 순서의 `[relativePath, SHA256(fileBytes)]` 배열을 JSON.stringify한 UTF-8 값의 SHA-256이다.

```json
{"pattern":"`((?:plugin|packages|src|scripts|tests|examples|node_modules|\\.github|docs\\/architecture)\\/[^`\\s]+\\.(?:mjs|tsx?|md|json|cs|ps1|ya?ml))","flags":"g"}
```

| 재검증 근거 | recipe class | 검사/제한 |
| --- | --- | --- |
| D1 경로·내용·HEAD 비교, 소유권·import·symbol·JSON 구조의 읽기 전용 검사 | safe-replay | 현재 파일 전체·실제 export/import를 비교한다. 변경·추가·삭제가 있으면 전체 INV pass로 돌아간다. |
| Verification Plan의 test/lint/typegen/build/sync 명령과 native 준비 조건 | manifest-only | 명령·목적지·기대 계약을 비교한다. 시험은 TEMP/child, build/typegen/sync는 파일을 만들 수 있어 replay에서 자동 실행하지 않는다. |
| 현재 fixture의 실행 결과·loopback MCP body·6개 delivered/rendered 본문 | manifest-only | Results와 코드의 fixture/경로를 비교한다. 과거 결과를 새 구현의 통과로 승계하지 않는다. |
| 실제 DB rows·운영 seed·package version·설치 loader·모델/커널/제품 인수 | volatile-non-replayable | 이 문서의 운영 실행 범위 밖이다. docs의 기존 runtime 보고서 및 별도 실행 범위에서만 갱신한다. |

당시 Runtime evidence는 코드 정리 순서·기존 fixture 기준선·메모리 MCP body의 정보 소실과,
양쪽 client/세 plan의 deliverable→render body에서 Codex 지침 누락을 포함했다.
최종 생성 파일·lock/hash의 구현 후 검증 위치를 Final artifact resolution map과 private templates.test에 배정했다.
정합화 당시에는 추가 회귀·Windows native·운영 배포·실제 모델 인수가 미실행이었다.
구현 후 회귀·native 결과는 위 Verification Results에 새로 기록했으며, 운영 배포·모델 인수는 계속 별도 범위다.

Remaining risks/closure: 느린 정상 요청의 deadline, 실제 child 정리 acknowledgement, 설치 winning loader와 운영 DB freshness는
Runtime matrix·Definition of Done 또는 별도 운영 인수에서 닫는다. credential 및 private 본문을 이 manifest에 기록하지 않았다.
Persistence: 사용자가 수정을 요청한 이 제안서. 당시 source/path/content-set signature와 historical clean status를 당시 최종 응답에 기록했다.

| 공개 HEAD 외 근거 | SHA-256(file bytes) |
| --- | --- |
| `node_modules/next/dist/docs/01-app/01-getting-started/01-installation.md` | `a801c5ba206c97472ed2a9aef93c5ba9d5044ae478b357697ed74b0b64ff1ccb` |
| `node_modules/next/package.json` | `3ae720e4b8cdad7503935b27b0d14e04390068bf10d6e685797ccf1044051967` |
| `plugin/templates/QA-VERIFIER-ROLLOUT.md` | `4109169206a3dca2f609a757f498079ebc2b352d7989cf62f4317768565ec731` |
| `plugin/templates/README.md` | `fca42060e121cc2acc01b550767564230e09dd039512e9fab3148da8a68339fe` |
| `plugin/templates/en/CLAUDE.runbook.md` | `5397c4a4469b25ab7e511e20ac6c71cbdfc2c1978cbbca72a5fa8a4595915731` |
| `plugin/templates/en/CODEX.runbook.md` | `f140aa37cee1d477826c34833b285a3df86f736d8a17d6897fe74a2c7ef0f841` |
| `plugin/templates/en/agents/dev.md` | `8a47e8579eab43e70e3da54cfb0af76da3fee5a0beb7ed5aa5e6f4f706666dc6` |
| `plugin/templates/en/agents/doc-auditor.md` | `cbb30ceacd0fe2115c43a4c5fd6a00fc53c043f9453f380c22fc0837635bc19b` |
| `plugin/templates/en/agents/feature-scout.md` | `8c72b63ddfa1dcae40ac38de67144a810772c91868b6e94456de35122f9473a3` |
| `plugin/templates/en/agents/impl-verifier.md` | `70f4f47963ee1c8e96c4a90ff44f22438932abebad410ff16adc905a7deebc44` |
| `plugin/templates/en/agents/plan-verifier.md` | `26caa913223752b0d3ae921495054b523ff9f38ebdfbc242bda8943edd9408df` |
| `plugin/templates/en/agents/pm.md` | `0db7b1dc3b6282915e47ba72c9e0dafb61a2b4a88cd337516c6b6a80cccbefb8` |
| `plugin/templates/en/agents/qa-verifier.md` | `619a90adecda4d0719a90ecf492a857141b4ad50536ed00c1e863ee03fc5a1ba` |
| `plugin/templates/en/docs/agents/README.md` | `6344eae0e53db7dc12b9fa8a33d4bbd5b43ce86bbf9f74e523d54f6b0d0ed188` |
| `plugin/templates/en/docs/plans/README.md` | `86c56405c4518a05d987067e1eb2969dea8a36be27711e8886eb000e513c5038` |
| `plugin/templates/en/docs/plans/template.md` | `60bdf430e4f0e87ce732a1a1f6626cf1d1088d741cb07f5bb69ce6e8115410e5` |
| `plugin/templates/en/docs/plans/verification-paths.md` | `9dc3f3470169efae12a81cb9b095b15dced2847e1535516e2a555e645bc15725` |
| `plugin/templates/templates.test.mjs` | `66e724cff27e99b4d953c4f190e556a71ef0c2e87f1962c4932c9aaec422b99f` |
