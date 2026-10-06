# Stagekeeper 아키텍처

이 디렉터리는 Stagekeeper의 현재 아키텍처와 새 코드가 따라야 할 경계를 정의하는
source of truth다. 구현 계획은 `docs/proposals/`, 조사 기록은
`docs/investigations/`, 결정의 배경은 `docs/ADR/`에 두고, 여기에는 **현재 적용할
구조와 규칙**만 둔다.

## 현재 상태

2026-09-01 기준 Phase 0·1이 구현·검증 완료된 상태다(스모크 인수:
`docs/test-reports/completed/2026-09-01-phase-1-smoke-acceptance.md`). 아래 구조가
실제 저장소와 일치하며, `npm run verify:fsd`·`npm run test:architecture`가 경계를
강제한다. `plugin/templates/`는 의도적으로 git 미추적이다 — 원본은 별도 private
저장소(`Sangeok/harness-templates`), 배포는 DB(`Template` 테이블) 경유.

Phase 4(2026-09-03)부터 에이전트 템플릿 본문은 파일로 나가지 않는다. `/api/templates`는
플랜에 맞춰 잘라 낸 것만 준다 — 에이전트 파일은 첫 `## step:` 앞의 **스텁**, 플랜 밖 보고
에이전트는 제외한다. 기본 런북은 `CLAUDE.runbook.md`이며 Codex 요청은 `CODEX.runbook.md`를 선택한다. 예전 Free variant는 배포하지 않는다. 단계 본문은
`agent_next`(MCP)가 한 번에 하나씩 준다. 무엇을 내려줄지는 `packages/core/deliver.mjs`
하나가 정하고, 서버(`src/server/templates.ts`)와 생성기(`plugin/bin/harness-init.mjs`의
로컬 우회로)가 같은 함수를 쓴다. 플랜·상한은 `packages/core/entitlement.mjs`.

2026-10-03 작업 트리에는 dual-client 계약과 Codex foreground 어댑터가 구현되어 있다.
서버 원장·승인·token 모델은 공통이고 client를 저장하지 않는다. Codex 역할은
`plugin/runtime/codex-thread.mjs`의 fresh App Server thread와 역할별 MCP bridge로 실행한다.
실제 모델의 권한 격리·양방향 인수·DB seed·배포는 완료되지 않았다. 이 소스 구조를
제품 지원 인증으로 해석하지 않는다. 미완료 근거는 [runtime 보고서](../test-reports/active/dual-client-runtime-report.md),
실제 source 계약은 [protocol.md](./protocol.md)의 dual-client 절을 따른다.

사용자는 선택한 native 클라이언트의 기존 설치·로그인으로 연결할 수 있어야 한다.
WSL이나 다른 클라이언트 로그인, 별도 Node·검증 스킬 설치를 사용자에게 요구하는
경로는 출시 기준을 충족하지 않는다. [system-overview.md](./system-overview.md)의
최소 설치 기준과 [후속 계획](../proposals/active/codex-dual-client-runtime-follow-ups.md)의
Windows 실행·패키징 게이트를 자동 watch보다 먼저 해결한다.

Windows Codex 역할은 scoped 파일 MCP backend로 읽기·목록·검색·guarded 쓰기와 중지를
실행한다. 검증된 Windows bundle은 별도 LPAC snapshot 명령 backend와 Node/npm·완전한
verifier를 포함한다. 명령 산출물은 복사본에서 버리고 원본 변경은 guarded 파일 도구로
수행한다. WSL이나 다른 클라이언트 로그인은 사용하지 않는다. 실제 설치·전체 제품 인수와
배포 준비 상태는 runtime 보고서에서 따로 추적한다. 상세 경계는 [protocol.md](./protocol.md)의
Windows 역할 backend 절을 따른다.

Phase 4는 2026-09-04에 완료됐다(제안서:
`docs/proposals/completed/2026-09-04-harness-platform-phase-4-entitlement.md`).
플랜은 Free/Pro/Max이고 상한은 5축이다 — 프로젝트·워크스페이스·백로그·이력 창·에이전트.
서버가 세우는 벽 셋: `report_submit`은 `implementing`에서 verify 원장을 요구하고,
생성·추가·동기화는 상한을 넘으면 `capReason`의 문장으로 거부하며, 상한 초과 프로젝트는
**선택되지 않은 상태로 보존된다**. 사용 가능 집합은 `Project.available`이며 소유자는 직접
`Project.ownerUserId`로 연결된다. 웹 읽기·사용 선택·토큰 폐기는 유지하고, agent MCP는 `project_get`만
허용한다. 이력 창은 조회만 자르고 저장은 전부 한다.
결제는 없다 — `Subscription`은 수동 부여이고 `/billing`은 읽기 전용이다.

2026-10-02부터 신규 AgentRun 사용량은 계정 전체의 첫 커밋부터 5시간 구간으로 집계한다.
Free 20회·Pro 100회·Max 무제한이며 기존 실행 재개는 허용한다. `/billing`은 퍼센트를 표시한다.
보호 API 요청은 별도로 계정 1,200회·프로젝트 300회/10분 DB window를 공유한다.
토큰은 여러 개 발급할 수 있고 선택 만료·이름 변경·활성/종료 목록을 제공한다.
저장·인증·응답 계약은 [protocol.md](./protocol.md)의 실제 요청 제한과 제품 사용량 절을 따른다.

D2 코드는 플랜 변경·등록·사용 선택을 Serializable transaction으로 처리하고 변경된 목록의 version과
event를 함께 저장한다. upgrade는 기존 목록을 유지하고 downgrade만 현재 목록을 줄인다.
저장소 연결 해제·재연결도 같은 소유자 잠금과 version/event 경계에서 처리한다. 해제는 프로젝트와
이력을 읽기 전용으로 보존하며 hs_/ho_를 폐기한다. hu_는 유지하고 다시 연결할 때 기존 프로젝트를
복원한다. 연결 해제·재연결은 별도 기능 스위치 없이 소유자의 웹 세션에서 사용할 수 있다.
최종 개인 프로젝트 모델에는 ProjectMember와 legacy Project.owner가 없다. `ownerUserId`와 `repoOwner`는
필수이고 사용자 삭제는 소유 프로젝트를 cascade한다. 외부 harness.json·MCP·template의 repository
owner 이름은 adapter가 유지한다. D3 cleanup 운영 배포에는 D2 운영 인수와 backup/복구 rehearsal이
선행되어야 한다. 로컬 구현·unit 통과는 그 증거가 아니다.

루트 `app/`은 Phase 0에서 `src/app/`으로 이동 완료됐다. Next.js는 루트 `app/`과
`src/app/`이 동시에 있으면 `src/app/`을 무시하므로 루트 `app/`을 다시 만들지
않는다 — 검사기가 동시 존재를 실패로 잡는다.

```text
stagekeeper/
├── src/
│   ├── app/                 # Next.js 라우팅·composition root
│   ├── fsd/                 # 프런트엔드 FSD root
│   │   ├── pages/
│   │   ├── widgets/
│   │   ├── features/
│   │   ├── entities/
│   │   └── shared/
│   ├── server/              # 인증·파이프라인·MCP·DB application services
│   └── generated/           # 생성 코드, 직접 수정 금지
├── packages/core/           # 런타임 의존성 없는 순수 규칙·프로토콜
├── plugin/                  # Claude/Codex manifest·skill·로컬 생성/실행 helper
├── prisma/                  # DB schema와 migration
├── scripts/                 # 저장소 검사·복사본 동기화·수동 운영 스크립트 (앱 런타임 아님, verification.md)
├── tests/server/            # 서버 전용 bootstrap·교차 모듈 테스트, integration/은 격리 PostgreSQL 필요
└── docs/architecture/       # 현재 문서
```

## 문서 지도

- [system-overview.md](./system-overview.md): 제품 주체, 런타임, 데이터 소유권,
  최상위 모듈의 관계
- [fsd.md](./fsd.md): FSD layer·slice·segment, import 방향, public API,
  Next.js Server/Client 경계
- [verification.md](./verification.md): 자동 경계 검사, 저장소 스크립트 목록, 리뷰 체크리스트
- [ADR-0001](../ADR/0001-adopt-feature-sliced-design.md): 이 구조를 선택한
  이유와 받아들인 trade-off
- [CONTEXT.md](../../CONTEXT.md): 구현과 독립적인 Stagekeeper 도메인 용어
- [sources.md](./sources.md): 원재료 매핑 — ApcH(`de25a1c`)의 무엇이 어디로 왔나
- [invariants.md](./invariants.md): 깨면 이 파이프라인이 아닌 불변식 여덟과 보드 규칙 셋
- [protocol.md](./protocol.md): MCP 도구 계약, 상태 기계, 보드 기록 규약, 계획서 절 일곱
- [qa-verifier.md](./qa-verifier.md): 선택적 브라우저 QA 역할, 테스트 환경, 실행·보고 결합
- [repository-disconnection.md](./repository-disconnection.md): 연결 상태·토큰·읽기 보존 계약과 운영 배포·복구 절차
- [rationale.md](./rationale.md): 규칙이 무엇을 겪고 생겼는지 — 골든 diff와 첫 스모크 요약

## 반드시 지키는 규칙

1. `src/app`은 URL, Next.js 특수 파일, 전역 provider와 composition만 소유한다.
   재사용 가능한 제품 코드는 `src/fsd`에 둔다.
2. FSD 의존성은 `pages → widgets → features → entities → shared` 방향으로만
   흐른다. 같은 layer의 다른 slice를 직접 import하지 않는다.
3. slice 밖에서는 해당 slice의 `index.ts` 또는 `index.server.ts`만 import한다.
   내부에서는 public API를 우회하지 않고 상대 경로를 사용한다.
4. `src/server`는 `src/fsd`를 import하지 않는다. 서버 Action/API adapter만
   FSD slice의 `api` segment에서 `src/server`를 호출할 수 있다.
5. `packages/core`는 `src`와 npm package에 의존하지 않는다. UI와 DB가 같은
   규칙을 공유해야 하면 순수 판정을 여기에 두고 양쪽이 가져다 쓴다.
6. `components/`, `hooks/`, `utils/`, `types/` 같은 기술 종류별 최상위 폴더를
   만들지 않는다. 함께 바뀌는 코드는 같은 slice에 둔다.
7. 새 layer나 예외 import를 만들기 전에 이 문서와 ADR을 먼저 바꾼다.

## 새 코드를 둘 위치

아래 순서로 결정한다.

1. URL 또는 Next.js 실행 진입점인가? → `src/app`
2. DB·인증·MCP·트랜잭션 같은 서버 기능인가? → `src/server`
3. 프레임워크와 무관한 순수 규칙인가? → `packages/core`
4. 전체 화면인가? → `src/fsd/pages/<slice>`
5. 여러 화면이 재사용하는 독립 UI 블록인가? → `widgets/<slice>`
6. 사용자가 수행하는 의미 있는 동작인가? → `features/<slice>`
7. 도메인 명사와 표현인가? → `entities/<slice>`
8. Stagekeeper가 아닌 앱에서도 쓸 수 있는 기반인가? → `shared/<segment>`

둘 이상의 후보가 떠오르면 현재 사용처에 가장 가까운 낮은 추상화에서 시작한다.
세 곳 이상에서 같은 책임과 같은 변경 방향으로 반복될 때만 위 layer로 추출한다.

## 개발 시작과 종료

코드를 작성하기 전에 이 문서와 작업에 관련된 세부 문서를 읽는다. Next.js 파일을
바꾸기 전에는 `node_modules/next/dist/docs/`의 해당 버전 문서도 읽는다.

```powershell
npm run check      # CI와 같은 게이트 — 복사본 동기화 검사 · lint · 타입 · 아키텍처 테스트
npm run verify:fsd
npm run test:architecture
```

경계 검사에 예외가 필요하면 검사기를 우회하지 않는다. 구조를 바꾸는 결정이라면
ADR을 새로 만들고, 제한된 일시 예외라면 `verification.md`에 소유자와 제거 조건을
기록한 뒤 검사기에 가장 좁은 범위로 반영한다.
