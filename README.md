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
- [활성 Phase 0·1 제안서](./docs/proposals/active/harness-platform-phase-0-1.md)

## 로컬 확인

```powershell
npm run dev
npm run lint
npm run verify:fsd
npm run test:architecture
npm run build
```

Next.js 코드를 수정하기 전에는 `AGENTS.md` 지침에 따라 설치된 버전의
`node_modules/next/dist/docs/`에서 관련 문서를 먼저 확인한다.
