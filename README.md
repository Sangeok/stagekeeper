# stagekeeper

사람이 승인 게이트를 쥐고 에이전트가 계획, 독립 검증, 구현, 인수를 증거와 함께
수행하도록 조율하는 개발 파이프라인 서비스다.

현재 저장소는 구현 전 스캐폴드 단계다. 제품 설계와 실행 제안서는 `docs/`에 있고,
새 코드는 Next.js에 맞춘 Feature-Sliced Design 경계를 따른다.

## 문서

- [아키텍처 시작점](./docs/architecture/README.md)
- [FSD 규칙](./docs/architecture/fsd.md)
- [시스템 개요](./docs/architecture/system-overview.md)
- [도메인 용어](./CONTEXT.md)
- [완료된 Phase 0·1 제안서](./docs/proposals/completed/2026-09-01-harness-platform-phase-0-1.md)

## 플러그인 설치

저장소를 Stagekeeper에 연결하는 `/harness:init`은 이 저장소의 `plugin/`이 제공하는
Claude Code 슬래시 명령이다. 플러그인이 세션에 없으면 Claude Code는
`Unknown command: /harness:init`만 내고 멈춘다 — 토큰과는 별개 경로라 토큰을
넣어도 해결되지 않는다.

```powershell
claude plugin marketplace add Sangeok/stagekeeper
claude plugin install harness@stagekeeper
claude plugin list      # harness가 보이면 설치된 것
```

한 세션만 시험하려면 설치 없이 불러올 수도 있다. 이때는 `/harness:init` 뒤 재시작할 때
같은 플래그를 다시 줘야 한다.

```powershell
claude --plugin-dir <stagekeeper 경로>/plugin
```

## 로컬 확인

```powershell
npm run dev
npm run check      # CI와 같은 게이트 — 복사본 동기화 검사 · lint · 타입 · 아키텍처 테스트
npm run verify:fsd
npm run test:architecture
npm run build
```

Next.js 코드를 수정하기 전에는 `AGENTS.md` 지침에 따라 설치된 버전의
`node_modules/next/dist/docs/`에서 관련 문서를 먼저 확인한다.
