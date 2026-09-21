# 아키텍처 검증

## 자동 검사

`scripts/verify-fsd-boundaries.mjs`는 외부 package 없이 정적 import를 검사한다.

```powershell
npm run verify:fsd
npm run test:architecture
npm run lint
npm run check      # 위 셋 + 복사본 동기화 검사 + 타입 검사 — CI와 같은 게이트
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
- `plugin/lib`가 `packages/core`의 배포 모듈과 바이트 동일한지 — 내용이 다른 것(drift)과
  원본이 사라진 것(orphan) 모두 (`scripts/plugin-lib.mjs --check`, `npm run check`의 첫 단계)

정규식 기반 검사라 계산된 dynamic import, TypeScript path alias의 복잡한 재정의,
런타임 의존성까지 완전히 증명하지는 못한다. 자동 검사를 통과했다는 사실은 아래
리뷰를 생략할 근거가 아니다.

## 저장소 스크립트

`scripts/`는 앱 런타임 코드가 아니다. 검사기와 운영 도구만 둔다.

| 스크립트 | 진입점 | 언제 | 하는 일 |
| --- | --- | --- | --- |
| `verify-fsd-boundaries.mjs` | `npm run verify:fsd`, `npm run lint`, `npm run check` | CI마다 | 위 FSD 경계 검사 |
| `tests/server/register-server-only.mjs` | `npm run test:server` | 서버 변경 시 로컬 | server-only marker만 대체하며 일반 React를 유지하는 교차 모듈 테스트 |
| `test-server-integration.mjs` | `npm run test:server:integration` | 격리 PostgreSQL에서 수동 | `TEST_DATABASE_URL`의 DB명이 `stagekeeper_test_*`이고 운영 URL과 host/port/database가 다른지 검사한 뒤 migrate deploy·직렬 통합 테스트. DB 생성·삭제·reset 없음 |
| `test-server-integration.test.mjs` | `npm run test:architecture` | CI마다 | URL 안전 검사와 migration→test 실행 순서·실패 중단 검사 |
| `verify-fsd-boundaries.test.mjs`, `plugin-lib.test.mjs` | `npm run test:architecture` | CI마다 | 검사기 자체의 테스트 |
| `retired-copy.test.mjs` | `npm run test:architecture` → check | CI마다 | 폐기된 표현 가드 — 웹의 보이는 문구·`SKILL.md`·product-copy.md 잠금 블록에 옛 연결 방식의 문장이 없는지. 규칙은 파일 머리의 `RETIRED`에 손으로 더한다 |
| `plugin-lib.mjs --check` | `npm run check` 첫 단계 | CI마다 | `plugin/lib` 드리프트·고아 판정, 실패 시 exit 1 |
| `plugin-lib.mjs` | `npm run sync:plugin-lib` | `packages/core/*.mjs`를 바꾼 뒤 | 복사본을 원본과 같게(덮어쓰기·삭제) |
| `seed-templates.ts` | `npm run seed:templates [-- --dir <dir>]` | private 템플릿을 바꾼 뒤, 로컬에서 | `plugin/templates/<lang>/**/*.md`를 `Template` 테이블에 upsert. `agents/*`는 저장 전 파싱 |
| `grant-plan.ts` | `npm run plan:grant -- <login> <free\|pro\|max> [note]` | 플랜을 붙일 때, 로컬에서 | availability service를 통한 plan/set/version/event atomic change |
| `lib/prisma.ts` | (헬퍼) | — | DB 스크립트의 Prisma 부트스트랩. `DATABASE_URL`이 없으면 exit 2 |
| `check-project-ownership-cleanup.ts` | `npm run check:project-ownership:cleanup -- --pre\|--post` | D3 cleanup 전후 | catalog·직접 owner·exact set·event를 read-only snapshot으로 검사 |
| `project-availability-cleanup.test.ts` | `npm run test:project-availability` | CI마다 | cleanup facts, SQL, CLI/receipt와 보존 계약의 DB 없는 회귀 검사 |
| `project-availability-runtime.test.ts` | `npm run test:project-availability` → check | CI마다 | Member/legacy owner/old policy 부재, final schema/generated client와 폐기 script 검사 |
| `rehearse-project-availability-d3.ts` | `npm run test:project-availability:d3:db -- --allow-fixtures --baseline <commit>` | 서로 다른 빈 격리 PostgreSQL 두 개에서 수동 | 고정 D2 artifact → cleanup → D3 등록 → 보상 migration → D2 smoke. 두 전용 URL 필수 |
| `restore-project-ownership-shadow.ts` | `npm run restore:project-ownership:shadow -- [--check\|--apply --backup-receipt <path>]` | 승인된 D3 복구 | 전용 URL·receipt·migration checksum을 검사하고 고정 보상 migration bundle을 적용 |
| `recovery/individual-project-availability-d3/restore-d2-shadow.sql` | 위 복구 CLI | D3 commit 뒤 D2 호환 복구 | 현재 direct owner에서 legacy shadow를 transaction으로 재구성. 일반 migration path에는 없음 |

`plugin/lib/`는 직접 고치지 않는다 — ESLint도 그 폴더를 무시한다(`eslint.config.mjs`). 원본을 고치고 동기화한다.

## 문구 잠금

`docs/conventions/product-copy.md`는 "코드는 이 파일에서 나온다"고 선언하지만 강제가 없어 두 번 어긋났다 —
§13(PR #34)과 §9(2026-09-21: 문서·스킬만 고친 커밋 `a766a0e`·`6871680`이 화면 다섯 군데를 두고 갔다).
아래 시험이 그 절들을 코드에 묶는다. 전부 `npm run test:web`(CI)에서 돈다.

| 잠금 | 문서의 자리 | 시험 | 묶는 대상 |
| --- | --- | --- | --- |
| §13 표의 행 | `board_transition`·`plan_submit`·`agent_next` | `src/server/mcp/tools.test.mjs` | MCP 도구 설명(글자 일치) |
| `token-reveal-shared`·`-project`·`-user` | §9 Token reveal | `src/fsd/entities/project-token/ui/token-reveal.test.ts` | `TokenReveal`(hs_·hu_ 각각 렌더) |
| `owner-token-reveal` | §9 Owner token reveal | 같은 파일 | `OwnerTokenReveal` |
| `turn-banner-connect` | §5 First run | `src/fsd/widgets/turn-banner/model/turn.test.ts` | 모델의 `detail`(글자 일치) — 배너는 그 값을 그린다 |

읽는 법과 블록 규칙(한 줄 = 한 단위, 줄바꿈 금지)은 `src/fsd/shared/lib/copy-lock.ts`와 product-copy.md 머리의
"Copy-lock blocks"에 있다. 화면 잠금은 **포함 검사**다: 블록의 모든 줄이 화면에 있는지만 본다. 그래서

- 문서만 고친 경우, 화면 문장을 고친 경우는 잡는다.
- 화면에 문서에 없는 문장을 **더한** 경우는 못 잡는다.
- 문서와 화면이 **같이 틀린** 경우는 못 잡는다 — `retired-copy.test.mjs`가 그 틈을 맡는데, 옛 표현을 사람이 등록해야 안다.
- `claude`처럼 짧은 단위는 어디서든 맞으므로 지키는 힘이 없다. 지키는 것은 문장이다.

## 변경 전 체크리스트

- [ ] [README.md](./README.md)와 [fsd.md](./fsd.md)를 읽었다.
- [ ] Next.js 파일을 바꾸면 설치된 버전의 관련 문서를 읽었다.
- [ ] 새 코드의 owner layer와 slice를 한 문장으로 설명할 수 있다.
- [ ] 새 slice가 필요하지 않다면 실제 사용처에 코로케이션했다.
- [ ] DB/인증/MCP/보안 경계를 `src/fsd`에 넣지 않았다.
- [ ] 연결 방식·도구 계약처럼 **사용자에게 말해 둔 사실**을 바꾸면, 옛 방식을 말하는 표현을
  `scripts/retired-copy.test.mjs`의 `RETIRED`에 더했다. product-copy.md만 고치는 커밋은 없다 — 잠금 블록을
  고치면 화면이 같은 커밋에 따라온다.

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

라우트 이동은 완료되어 현재 진입점은 `src/app/`이다. 루트 `app/`을 함께 만들면
Next.js가 `src/app/`을 무시하므로 검사기가 즉시 실패시킨다.

활성 Phase 0·1 제안서에는 작성 시점의 deep import 예시가 남아 있을 수 있다.
그 제안서를 구현할 때는 이 문서가 최신 architecture source of truth이며, public
API를 추가하고 import를 정리한 뒤 진행한다. 사용자가 수정 중인 제안서 본문은
이번 작업에서 덮어쓰지 않는다.
