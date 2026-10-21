---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-10-21"
updated-at: "2026-10-21"
approved-by: "사용자(채팅 실행 지시 및 후속 범위 정정)"
approved-at: "2026-10-21"
approval-scope: "프로젝트 전역의 동작·타입·검증에 영향을 주지 않는 일반 설명 주석 제거. 기능성 주석·문자열 데이터·체크섬 계약·라이선스는 보존하고 배포 복사본 동기화 및 검증 수행"
completed-at: null
verification-summary: "최신 dev 06e093f 기준 원본 351개 파일의 주석 2,231개와 미러 17개 파일의 주석 150개 제거. src의 비생성 JS/TS 주석 0개. AST·변환 코드·설정 구조·스키마 모델 보존, check·core/CLI·web·server 테스트 및 Webpack build 통과. 기본 Turbopack의 기존 EPERM으로 전체 완료 처리 보류"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/completed/2026-10-02-non-behavioral-comment-cleanup.md"
  - "docs/architecture/README.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/server.md"
  - "docs/architecture/test-organization.md"
  - "docs/architecture/verification.md"
  - "docs/conventions/product-copy.md"
---

# 프로젝트 전역의 일반 설명 주석 정리

## Summary

프로젝트 전역에서 실행·타입·도구·검증에 사용되지 않는 일반 설명 주석을 제거했다.
구현 이유나 보안 설계를 설명한다는 이유만으로 주석을 보존하지 않는다.
최신 `dev`와 비교해 원본 351개 파일의 주석 2,231개와 배포 복사본 17개 파일의 주석 150개를 제거했다.

`token-reveal.tsx`와 `connect-command.ts`를 포함해 `src/app`, `src/fsd`, `src/server` 및
`src/proxy.ts`의 비생성 JS/TS 파일에는 주석이 없다. 타입·도구용 주석과 본문 체크섬 계약은 보존했다.
검사·테스트와 Webpack production build는 통과했으나, 기본 Turbopack의 기존 로컬 EPERM에 대한
성공 검증이 남아 있어 `active/`에 유지한다.

## Goal

- 동작·타입·검증에 영향을 주지 않는 일반 설명 주석을 프로젝트 전역에서 제거한다.
- 타입 검사·실행 지시문·파일 본문 소비 계약과 실제 보안·업무 동작을 보존한다.
- 이후 코드 작성 시 별도 요청 없는 설명 주석 추가를 금지하는 기존 `AGENTS.md` 변경을 보존한다.

## Proposal Size

`proposal-size`: standard. 여러 영역의 삭제와 복사본 동기화가 포함된다.
동작·API·라우팅·권한·데이터 모델을 변경하는 작업은 아니다.

## Current State

- 구현·최종 검증 기준: `dev`의 `06e093f83beeecf6cb4523e99eaa7af54e87dc41`.
- 작업 브랜치: `harness/non-behavioral-comment-cleanup`.
- 최신 `dev`의 background runner 구현과 브랜치 정리 정책을 반영한 뒤 다시 검증했다.
  충돌한 3개 파일도 최신 기능 구현을 유지하며 설명 주석만 제거했다.
- `AGENTS.md`의 설명 주석 추가 금지 정책을 보존했다. 후속 사용자 요청에 따라 커밋·푸시와 `dev` 대상 PR 제출을 진행한다.
- 최초 C01–C07은 6개 파일의 7개 조각만 제거했다. 다음 C08은 `connect-command.ts`의 설명 주석 17개만 제거했다.
  구현 이유를 설명하는 주석까지 보존하고 지적받은 파일만 고쳤던 범위 설정은 사용자 의도보다 좁았다.
- 사용자 후속 지적에 따라 C09에서 프로젝트 전역으로 정정했다.
  이전의 7개·17개 목록은 적용 이력이며 현재 실행 범위를 제한하는 기준이 아니다.

## Scope

포함 범위:

- 자체 JS/TS 코드: `src`의 비생성 파일, `packages/core`, `plugin/bin`, `plugin/runtime`, `scripts`, `tests`, 루트 설정.
- `src/app/globals.css`의 일반 설명 주석.
- 두 `.github/workflows/*.yml`의 YAML 주석 및 `.gitignore`의 주석.
- `prisma/schema.prisma`의 일반 `//` 주석. 모델 동등성 확인 후 클라이언트를 재생성한다.
- `packages/core`에서 파생되는 `plugin/lib` 복사본은 기존 동기화 명령으로 맞춘다.

보존·제외 범위:

- JSDoc 타입 주석, `@ts-check`, triple-slash 참조, shebang, 도구 지시문 및 라이선스.
- `scripts/windows-role-runtime-cache.mjs` 전체: 자기 본문이 캐시 키의 입력이므로 설명 주석 3개도 그대로 유지한다.
- 체크섬 대상인 기존 SQL migration·복구 SQL, Windows Node 빌드 레시피와 native helper의 원본.
- 자동 관리되는 `migration_lock.toml`, `next-env.d.ts`, `src/generated`, `.next`, `node_modules`의 수동 편집.
- 별도 저장소의 `plugin/templates`, 에이전트 지시인 `plugin/skills`, 기존 Markdown 문서의 내용·기능 표식.
- 문자열·템플릿 리터럴·정규식 안의 주석 모양 데이터. fixture·런북 marker·CSS class 문자열도 변경하지 않는다.
- 동작·타입·import/export·directive·설정 값·DB 모델·의존성·라우팅 변경.

## Proposal

### CON-CMT-001: 설명과 기능을 기준으로 구분한다

코드의 이유·배경·보안 설계·단계·파일 소유권을 설명하는 주석도,
실행·타입·도구·검증에 사용되지 않으면 삭제 대상이다.
단순히 읽는 데 유용하다는 이유로 기능성 주석으로 분류하지 않는다.

### CON-CMT-002: 코드·타입·설정 의미를 보존한다

- JS/TS는 파서가 식별한 실제 주석만 제거하고 전후 구문 트리와 변환 코드를 비교한다.
- JSX 주석만 담은 빈 컨테이너와 표시되지 않는 공백 노드의 제거는 허용한다.
  그 외 구문 차이는 없어야 하며, 런타임 JS 출력은 동일해야 한다.
- 선언 파일은 런타임 출력이 없으므로 선언 구문 트리로 타입 보존을 확인한다.
- 타입·도구 지시문은 원문을 유지한다. URL·문자열·정규식을 정규식 일괄 삭제로 훼손하지 않는다.
- CSS는 주석을 제외한 PostCSS 구문 트리, YAML은 파싱한 중첩 객체,
  `.gitignore`는 실제 패턴 목록을 보존한다.

### CON-CMT-003: 본문 소비·배포·데이터 모델 계약을 보존한다

- 본문 자체가 체크섬 입력인 예외 파일은 바꾸지 않는다.
- 미러를 직접 고치지 않고 `npm run sync:plugin-lib`로 동기화한다.
- Prisma 주석 제거 전후 migration diff가 비어 있어야 한다.
  재생성 클라이언트의 runtime data model과 타입·API는 같아야 한다.
- schema의 설명이 포함되던 생성물 `inlineSchema` 문자열만 달라지는 것은 예상한 결과다.
  DB에 migration을 적용하거나 seed를 실행하지 않는다.
- 기존 사용자 변경을 보존하고 이번 작업 외의 기능 수정으로 검증을 우회하지 않는다.

## Affected Files

다음 수치는 최종 기준 `dev`와 비교한 전체 변경 파일과 삭제 주석 수다.
JS/TS 주석은 파서 토큰 단위, YAML·ignore·schema는 삭제한 주석 단위로 센다.

| 영역 | 파일 | 삭제 주석 |
| --- | ---: | ---: |
| `.github/workflows` | 2 | 17 |
| `.gitignore` | 1 | 16 |
| `eslint.config.mjs` | 1 | 5 |
| `next.config.mjs` | 1 | 9 |
| `prisma.config.ts` | 1 | 1 |
| `packages/core` | 29 | 183 |
| `plugin/bin`·`plugin/runtime` | 21 | 334 |
| `scripts` | 27 | 119 |
| `src/app` — CSS 포함 | 28 | 109 |
| `src/fsd` | 136 | 594 |
| `src/proxy.ts` | 1 | 2 |
| `src/server` | 72 | 654 |
| `tests` | 30 | 99 |
| `prisma/schema.prisma` | 1 | 89 |
| 원본 합계 | 351 | 2,231 |
| `plugin/lib` 동기화 | 17 | 150 |
| 전체 합계 | 368 | 2,381 |

`connect-command.ts`를 포함한 이전 단계의 변경도 위 최종 수치에 한 번씩 포함한다.
`AGENTS.md` 정책 변경과 이 제안서를 포함하면 커밋 대상은 총 370개 파일이다.
정확한 적용 경로는 `git diff --name-only origin/dev...HEAD`로 확인한다.

## Safety Analysis

### 제거 후 남은 JS/TS 주석

생성물·의존성·별도 template 저장소를 제외한 JS/TS 659개 파일을 다시 파싱했다.
남은 주석은 다음 74개이며 일반 설명을 유지한 예외는 본문 체크섬 대상 1개 파일뿐이다.

| 경로 | 개수 | 실제 소비 계약 |
| --- | ---: | --- |
| `next.config.mjs` | 4 | `@ts-check`, Next 설정·입력의 JSDoc 타입 |
| `packages/core/backlog.mjs` | 3 | export 타입·입력·반환 타입 |
| `packages/core/client-runtime.mjs` | 3 | client union 및 입력 타입 |
| `packages/core/deliver.mjs` | 1 | 문자열 record 타입 |
| `packages/core/entitlement.mjs` | 9 | plan·가용성 후보·입력·반환·배열 타입 |
| `packages/core/repo-url.mjs` | 1 | URL 파서 입력·반환 타입 |
| `packages/core/request-rate.mjs` | 1 | 날짜·요청 수 타입 |
| `packages/core/runner.mjs` | 11 | const tuple·신호·상태·입력·반환 타입 |
| `packages/core/token-validity.mjs` | 3 | 토큰·날짜 입력·반환 타입 |
| `packages/core/usage-window.mjs` | 1 | 사용량 판정 입력 타입 |
| `plugin/runtime/runner-client.mjs` | 1 | 요청·응답 union 타입 |
| `scripts/windows-role-runtime-cache.mjs` | 3 | `windowsRuntimeCacheKey`가 자기 본문을 해시 |
| 위 core 타입 주석의 `plugin/lib` 복사본 | 33 | core와 바이트 동일한 배포 복사본 |
| 합계 | 74 | 타입·도구 71개, 본문 체크섬 3개 |

`src/app`, `src/fsd`, `src/server`, `src/proxy.ts`의 주석 수는 0이다.
`token-reveal.tsx`의 발급·해시 보관·소유 layer·copy-lock 관련 설명도 모두 제거했다.
설명만 지웠으며 실제 보안 동작과 표시 문구는 유지했다.

### 구성·생성물 확인

- CSS: 소스의 주석 제외 AST가 같다. 최종 기준 `dev`와 현재 소스를 각각 같은 Tailwind 설정으로
  처리한 전체 CSS도 주석 제외 AST가 같다. 설명 주석 삭제로 class 수집 결과가 바뀌지 않았다.
  최신 `dev` 반영 전 단계에서도 Webpack production CSS의 동일성을 확인했다.
- YAML: 두 workflow를 파싱한 값이 같다. 실행 스크립트·조건·버전·캐시 설정을 바꾸지 않았다.
- ignore: 주석만 제거했고 실제 패턴·부정 패턴·순서는 같다.
- Prisma: 기존 schema와 현재 schema의 `migrate diff --script --exit-code` 결과는
  `-- This is an empty migration.`이며 exit 0이다. DB 연결·쓰기 없이 두 파일만 비교했다.
- 생성 클라이언트: 32개 생성 파일 중 `internal/class.ts`의 `inlineSchema` 문자열만 달라졌다.
  그 필드를 제외한 AST와 runtime data model·parameterization schema·타입·API 및 나머지 31개 파일은 같다.
- migration SQL·복구 SQL·Windows 레시피·native helper·캐시 검증 파일은 원본 그대로다.
- `AGENTS.md`는 최신 `dev` 본문에 설명 주석 추가 금지 정책만 더한 상태다.

## Execution Plan

### TASK-CMT-01: 전역 주석 제거와 복사본 동기화

- governed-by: CON-CMT-001, CON-CMT-002, CON-CMT-003
- verified-by: VFY-CMT-01

1. 생성물·별도 template·문자열 데이터를 제외하고 실제 주석을 파서로 열거한다.
2. 기능성 지시문과 본문 체크섬 예외를 식별한 뒤 삭제 전 본문을 보존한다.
3. 일반 설명 주석과 그 주석만 담은 행·JSX 컨테이너를 제거한다.
4. 코드·타입·설정 의미 비교를 통과한 변경만 적용한다.
5. Prisma의 빈 migration diff를 확인하고 클라이언트를 재생성한다.
6. `npm run sync:plugin-lib`로 17개 모듈을 동기화한다.

### TASK-CMT-02: 전역 검증과 실행 기록

- governed-by: CON-CMT-001, CON-CMT-002, CON-CMT-003
- verified-by: VFY-CMT-01, VFY-CMT-02

일반 설명 주석이 지적된 파일 외에 남지 않았는지 전역 재검사한다.
검사·테스트·빌드와 생성물 비교를 수행하고 실제 결과를 기록한다.
기본 빌드 실패를 다른 bundler의 성공으로 대체하지 않는다.

## Verification Plan

### VFY-CMT-01: 의미 보존·남은 주석·변경 범위 확인

대상 제약: CON-CMT-001, CON-CMT-002, CON-CMT-003.

- 원본 351개 파일과 미러 17개 파일의 변경을 최종 기준 `dev`와 비교해야 한다.
- JS/TS 구문 트리와 변환 코드, 타입·도구용 주석 원문이 같아야 한다.
  의미 없는 JSX 빈 컨테이너·공백만 AST 비교에서 제외한다.
- CSS·YAML·ignore·schema 및 생성 클라이언트는 위 Safety Analysis의 비교를 통과해야 한다.
- `src`의 비생성 JS/TS 주석은 0개, 전체 대상 JS/TS 잔여 74개는 명시한 보호 목록과 같아야 한다.
- 두 사용자 지적 파일에 주석이 없어야 하며 Markdown 표식·fixture 문자열·라이선스를 훼손하지 않아야 한다.
- 미러 일치, 보호 파일의 변경 없음, 기존 AGENTS 보존, `git diff --check`를 확인한다.

### VFY-CMT-02: 기존 품질 게이트와 회귀 검증

대상 제약: CON-CMT-001, CON-CMT-002, CON-CMT-003.

```bash
npm run db:generate
npm run sync:plugin-lib
npm run check
npm test
npm run test:web
npm run test:server
npm run build
```

`check`는 미러·lint·FSD·서버 경계·Next typegen·TypeScript·architecture·project-availability 검사를 포함한다.
Prisma 클라이언트 생성은 타입·서버 검사 전에 수행한다. 의존성은 기존 lockfile을 사용하며 추가·업데이트하지 않는다.

기본 Turbopack의 로컬 환경 제약을 구분하기 위해 다음 보조 빌드도 수행한다.

```bash
node node_modules/next/dist/bin/next build --webpack
```

Webpack 성공은 기본 `npm run build`의 성공을 뜻하지 않는다.
운영 DB·실제 native Windows·private template 실행이나 CI 성공을 주장하지 않는다.

## Verification Results

실행일: 2026-10-21. Node `v26.4.0`, TypeScript `5.9.3`, 주석 파서 `8.68.0`.

| 검사 | 결과 |
| --- | --- |
| 전역 삭제 전후 AST·JS 출력·보호 주석 | PASS — JS/TS 362개 파일의 실행 코드 동일, 선언 파일 1개의 타입 동일 |
| CSS·YAML·ignore 구조 | PASS — 주석 제외 의미 동일 |
| Prisma schema diff | PASS — 빈 migration, exit 0, DB 쓰기 없음 |
| `npm run db:generate`와 생성물 비교 | PASS — 32개 중 1개 파일의 inline schema 문자열만 변화 |
| `npm run sync:plugin-lib` | PASS — 17개 복사, orphan 0 |
| `npm run check` | PASS — lint 오류 0·기존 미사용 변수 경고 3, FSD·서버·typegen·tsc 통과, architecture 121 pass/2 skip, availability 18 pass |
| `npm test` | PASS — 435 pass/16 skip, 실패 0 |
| `npm run test:web` | PASS — 710 pass, 실패·skip 0 |
| `npm run test:server` | PASS — 139 pass/1 skip, 실패 0 |
| Webpack production build | PASS — 컴파일·타입 검사·정적 생성·라우트 수집 성공 |
| 최종 기준 `dev`와 전체 Tailwind CSS 비교 | PASS — 같은 설정으로 생성한 CSS의 주석 제외 AST 동일 |
| 기본 `npm run build` | 성공 검증 미완료 — 이전 실행에서 CSS worker의 포트 bind EPERM이 sandbox 밖 승인 재실행에서도 발생. C09에서 성공한 것으로 기록하지 않음 |

기본 테스트와 웹 테스트는 이전에 허용한 로컬 포트 사용 환경에서 실행했다.
skip은 기존 플랫폼·native 조건부 시험 및 opt-in client-reference manifest 시험이다.
기본 Turbopack의 동일한 로컬 EPERM은 [기존 공개 문서 페이지 기록](./public-docs-pages.md)에도 있다.
Next 설정 변경·타입 검사 생략·검사 예외 추가로 실패를 우회하지 않았다.

최신 `dev` 반영 후 최종 실행의 임시 로그는 `/tmp/stagekeeper-pr-check.log`,
`/tmp/stagekeeper-comment-core-test-unsandboxed.log`, `/tmp/stagekeeper-comment-web-test-unsandboxed.log`,
`/tmp/stagekeeper-pr-server-test.log`, `/tmp/stagekeeper-pr-webpack-build.log`에 있다.
최종 의미 보존·주석 전수 검사 기록은 `/tmp/stagekeeper-final-pr-equivalence.json`,
CSS 비교 기록은 `/tmp/stagekeeper-latest-dev-css-comparison.json`에 있다.
임시 파일은 저장소 배포물이나 영구 검증 보증이 아니다.

## Definition of Done

- [x] 지적된 두 파일뿐 아니라 자체 코드 전역의 일반 설명 주석을 제거했다.
- [x] 코드·타입·설정·DB 모델·실제 보안 동작을 보존했다.
- [x] 잔여 JS/TS 주석 74개가 타입·도구·체크섬 보호 목록과 일치한다.
- [x] 미러 동기화·기존 검사·테스트·Webpack 빌드와 CSS 비교를 통과했다.
- [x] 사용자 기존 변경과 본문 체크섬·문자열 데이터·라이선스를 보존했다.
- [ ] 기본 `npm run build`의 성공을 확인하고 완료 metadata·문서 위치를 갱신한다.

## Risks and Rollback

- 기본 Turbopack build의 성공 검증이 남아 있다. 가능한 환경에서 같은 소스의 기본 build gate를 확인해야 한다.
- Windows 전용 skip과 opt-in 시험을 전체 제품 인수 PASS로 해석하지 않는다.
- 롤백은 이번 주석 삭제 diff와 대응 미러·schema 주석을 복원한 뒤 클라이언트를 재생성한다.
  다른 사용자 변경이나 브랜치를 reset하지 않는다.

## Completion or Closure Notes

C09의 전역 일반 주석 정리와 보조 검증은 적용 완료했다.
초기처럼 구현 이유를 설명하는 주석을 자동으로 보존하거나 지적받은 파일만 정리한 상태가 아니다.
기본 build gate가 남아 있으므로 `completed-at`은 비워 두고 `active/`에 유지한다.
