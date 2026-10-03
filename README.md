# stagekeeper

사람이 승인 게이트를 쥐고 에이전트가 계획, 독립 검증, 구현, 인수를 증거와 함께
수행하도록 조율하는 개발 파이프라인 서비스다.

웹·MCP 서버와 Claude Code 플러그인이 구현되어 있다. Codex foreground 지원 소스와
공통 재개 계약도 추가했으며 실제 모델 권한·교차 클라이언트 인수 및 배포는 검증 중이다.
제품 설계와 실행 제안서는 `docs/`에 있고, 새 코드는 Next.js의 Feature-Sliced Design 경계를 따른다.

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
claude plugin install harness@stagekeeper-local
claude plugin list      # harness가 보이면 설치된 것
```

한 세션만 시험하려면 설치 없이 불러올 수도 있다. 이때는 `/harness:init` 뒤 재시작할 때
같은 플래그를 다시 줘야 한다.

```powershell
claude --plugin-dir <stagekeeper 경로>/plugin
```

## Codex 어댑터 소스

`plugin/.codex-plugin/plugin.json`은 `$harness-init`, `$harness-run`, `$harness-resume`을
노출한다. init은 Claude 생성물을 보존하고 Codex 역할 TOML과 별도 런북을 만든다.
fresh 역할 실행과 공통 잠금의 사용법은 [plugin/README.md](./plugin/README.md)를 따른다.
자동 Codex watch는 구현하지 않았다. private template은 별도 저장소 변경이므로 public
코드만 배포해서는 지원을 활성화할 수 없다. [검증 보고서](./docs/test-reports/active/dual-client-runtime-report.md)의
필수 host·DB·설치·인수 항목을 통과하기 전에는 제품 지원 완료로 선언하지 않는다.

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
