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
에이전트는 제외, Free는 `CLAUDE.runbook.free.md`가 런북 자리에 들어간다. 단계 본문은
`agent_next`(MCP)가 한 번에 하나씩 준다. 무엇을 내려줄지는 `packages/core/deliver.mjs`
하나가 정하고, 서버(`src/server/templates.ts`)와 생성기(`plugin/bin/harness-init.mjs`의
로컬 우회로)가 같은 함수를 쓴다. 플랜·상한은 `packages/core/entitlement.mjs`.

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
├── plugin/                  # 사용자 저장소에 설치되는 Claude Code 플러그인
├── prisma/                  # DB schema와 migration
└── docs/architecture/       # 현재 문서
```

## 문서 지도

- [system-overview.md](./system-overview.md): 제품 주체, 런타임, 데이터 소유권,
  최상위 모듈의 관계
- [fsd.md](./fsd.md): FSD layer·slice·segment, import 방향, public API,
  Next.js Server/Client 경계
- [verification.md](./verification.md): 자동 경계 검사와 리뷰 체크리스트
- [ADR-0001](../ADR/0001-adopt-feature-sliced-design.md): 이 구조를 선택한
  이유와 받아들인 trade-off
- [CONTEXT.md](../../CONTEXT.md): 구현과 독립적인 Stagekeeper 도메인 용어
- [sources.md](./sources.md): 원재료 매핑 — ApcH(`de25a1c`)의 무엇이 어디로 왔나
- [invariants.md](./invariants.md): 깨면 이 파이프라인이 아닌 불변식 여덟과 보드 규칙 셋
- [protocol.md](./protocol.md): MCP 도구 계약, 상태 기계, 보드 기록 규약, 계획서 절 일곱
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
npm run verify:fsd
npm run lint
npm run test:architecture
```

경계 검사에 예외가 필요하면 검사기를 우회하지 않는다. 구조를 바꾸는 결정이라면
ADR을 새로 만들고, 제한된 일시 예외라면 `verification.md`에 소유자와 제거 조건을
기록한 뒤 검사기에 가장 좁은 범위로 반영한다.
