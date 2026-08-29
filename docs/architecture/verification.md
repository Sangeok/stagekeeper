# 아키텍처 검증

## 자동 검사

`scripts/verify-fsd-boundaries.mjs`는 외부 package 없이 정적 import를 검사한다.

```powershell
npm run verify:fsd
npm run test:architecture
npm run lint
```

`npm run lint`는 ESLint 뒤에 FSD 검사를 실행하므로 일반적인 품질 게이트에서
아키텍처 경계도 함께 확인한다.

검사 대상:

- FSD layer의 상향 import
- 같은 layer의 다른 slice import
- 다른 slice 내부로 들어가는 deep import
- non-empty slice의 public API 누락
- FSD에서 `src/server`를 호출하는 server adapter의 위치와 directive
- Client Component의 서버 모듈 import
- `src/server → src/fsd` 역방향 의존
- `packages/core`의 `src` 또는 외부 npm package 의존
- `src/components`, `src/hooks`, `src/lib`, `src/utils`, `src/types` 같은 전역
  기술 분류 폴더
- kebab-case가 아닌 layer/slice/segment/file 이름
- 루트 `app/`과 `src/app/`의 동시 존재

정규식 기반 검사라 계산된 dynamic import, TypeScript path alias의 복잡한 재정의,
런타임 의존성까지 완전히 증명하지는 못한다. 자동 검사를 통과했다는 사실은 아래
리뷰를 생략할 근거가 아니다.

## 변경 전 체크리스트

- [ ] [README.md](./README.md)와 [fsd.md](./fsd.md)를 읽었다.
- [ ] Next.js 파일을 바꾸면 설치된 버전의 관련 문서를 읽었다.
- [ ] 새 코드의 owner layer와 slice를 한 문장으로 설명할 수 있다.
- [ ] 새 slice가 필요하지 않다면 실제 사용처에 코로케이션했다.
- [ ] DB/인증/MCP/보안 경계를 `src/fsd`에 넣지 않았다.

## 리뷰 체크리스트

- [ ] import가 낮은 layer로만 향한다.
- [ ] 같은 layer의 slice들이 서로 독립적이다.
- [ ] slice 외부 import가 public API를 사용한다.
- [ ] public API가 필요한 symbol만 명시적으로 export한다.
- [ ] server/client public API가 섞이지 않았다.
- [ ] 상태, schema, 테스트, loading/error UI가 변경 책임 근처에 있다.
- [ ] 전역 store, 공통 hook, shared 추출이 실제 반복과 같은 변경 방향으로
  정당화된다.
- [ ] `src/app` route가 composition 이상을 떠안지 않는다.
- [ ] `src/server`가 UI 표현이나 FSD 타입에 의존하지 않는다.
- [ ] `npm run lint`, `npm run test:architecture`, 관련 테스트가 통과한다.

## 예외 정책

영구적인 layer·의존 방향 변경은 ADR이 필요하다. 일시 예외가 불가피하면 이
문서 아래 표에 기록하고 검사기에 **파일 단위**로만 반영한다. 디렉터리 전체 또는
규칙 전체를 끄는 예외는 허용하지 않는다.

| 경로 | 예외 | 소유자 | 제거 조건 |
| --- | --- | --- | --- |
| 현재 없음 | — | — | — |

## 마이그레이션 주의

현재 루트 `app/`은 초기 스캐폴드다. 승인된 Phase 0 작업이 이를 `src/app/`으로
이동하기 전까지 검사기는 루트 `app/`을 허용한다. 단, 두 위치가 동시에 생기면
Next.js가 `src/app/`을 무시하므로 즉시 실패한다.

활성 Phase 0·1 제안서에는 작성 시점의 deep import 예시가 남아 있을 수 있다.
그 제안서를 구현할 때는 이 문서가 최신 architecture source of truth이며, public
API를 추가하고 import를 정리한 뒤 진행한다. 사용자가 수정 중인 제안서 본문은
이번 작업에서 덮어쓰지 않는다.
