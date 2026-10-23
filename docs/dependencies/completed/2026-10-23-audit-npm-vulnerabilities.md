# npm audit 대응 — 운영 의존성 보안 업그레이드

완료일: 2026-10-23. 기준: `dev` `28c8d07`.

## 목적

2026-10-23 `npm audit --omit=dev`가 운영 의존성에서 critical 1건, high 8건을 보고했다.
같은 메이저 안의 판 올림으로 운영 의존성 취약점을 0건으로 만든다.

## 권고와 이 저장소의 노출

| 권고 | 이 저장소에서의 노출 |
| --- | --- |
| Next.js: Server Actions DoS (GHSA-p3m5-59mp-jv5r, `<=16.4.0`) | 해당. `"use server"` 파일 15개 |
| Next.js: 이미지 최적화 API RCE, `sharp <0.35.5`·glibc Linux (GHSA-2464-fhr4-w9xw) | Vercel 운영에서 실제 노출 여부는 확인하지 않았다. 업그레이드로 `sharp` 0.35.5가 설치된다 |
| Next.js: `next/og` `ImageResponse` RCE (GHSA-vcvr-r3jv-pc5j, `>=16.2.0 <16.3.6`) | `src/app/icon.tsx`, `apple-icon.tsx`, `opengraph-image.tsx`가 사용한다. 공격자 입력이 SVG에 들어가야 성립하며 이 경로들의 입력 경로는 확인하지 않았다 |
| Next.js: `use cache` RCE (GHSA-673q-mjm6-r5xr) | `use cache`를 쓰지 않는다 |
| Next.js: SSRF·캐시 오염·정보 노출 등 moderate/low | 16.3.8 이상에서 수정 |
| MCP SDK: 공유 transport/server가 다른 클라이언트에 메시지 전달 (GHSA-jm63-cq47-j5jp) | `mcp-handler`가 요청마다 `new McpServer`를 만드는 factory를 SDK에 넘긴다(`mcp-handler@2.1.1` `dist/index.mjs`). 그래도 SDK를 수정판으로 올린다 |
| MCP SDK: 요청 하나로 메모리 고갈, 다른 서비스용 bearer token 허용 | 수정판 2.3.0 이상 |
| `prisma`·`@prisma/config`(`deepmerge-ts`), `mysql2`, `fast-uri`, `source-map-js` | 하위 의존성 수정판으로 갱신 |

## 변경

| 패키지 | 이전 | 이후 |
| --- | --- | --- |
| `next` | `16.3.3` | `16.4.2` (정확한 판 고정 유지) |
| `eslint-config-next` (dev) | `16.3.3` | `16.4.2` |
| `@modelcontextprotocol/server` | `^2.0.0` (설치 2.0.0) | `^2.3.1` |
| `mcp-handler` | `^2.1.1` | `^2.3.0` |
| `@prisma/client`, `@prisma/adapter-pg` | `^7.10.0` | `^7.10.1` |
| `prisma` (dev) | `^7.10.0` | `^7.10.1` |

그 뒤 `npm audit fix`(`--force` 없음)로 하위 의존성만 갱신했다. `package.json`과
`package-lock.json` 외 코드 변경은 없다. `docs/architecture/verification.md`의 Windows
역할 빌드 호환 경로 설명은 Next 판 표기만 16.4.2로 바꿨다.

Next 16.4의 문서(`node_modules/next/dist/docs`)를 16.3.3판과 비교했다. 새 API
(`navigation`, `prefetch`, `ensureStatic`, bundle analyzer)가 추가됐고, 이 저장소가 쓰는
기능의 deprecation이나 제거는 없었다. `partialPrefetching` 경고는 `cacheComponents`를
켠 앱에만 해당한다.

## 결과

- `npm audit --omit=dev`: 0건.
- `npm audit` 전체: high 5건이 남는다. 모두 개발 전용 lint 체인
  `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob@3.3.1` → `micromatch` →
  `braces`의 GHSA-vfj7-8cjw-p6xm(깊게 중첩된 패턴의 stack exhaustion)이다. 권고의 영향
  범위가 모든 판이라 수정판이 없다. npm이 제안하는 해결은 `eslint-config-next` 14로의
  메이저 다운그레이드라 적용하지 않았다. 이 체인은 저장소 안의 lint 대상 glob만 처리하고
  운영 번들에 들어가지 않는다.

## 검증

로컬(Windows, 이 변경의 worktree, 실제 `npm install`):

| 명령 | 결과 |
| --- | --- |
| `npm run db:generate` | Prisma Client 7.10.1 생성 |
| `node scripts/plugin-lib.mjs --check`, `npm run lint`, `npx eslint .` | 통과, 경고 0 |
| `next typegen`, `tsc --noEmit` | 통과 |
| scripts 시험 | 195개 중 192 pass, 0 fail, 3 skip |
| `npm test` | 501개 중 499 pass, 0 fail, 2 skip |
| `npm run test:web` | 745개 모두 pass |
| `npm run test:server` | 140개 중 139 pass, 0 fail, 1 skip (build 뒤 manifest 검사) |
| `npm run build` | Next.js 16.4.2 (Turbopack) production build 통과 |

PostgreSQL 통합 시험(MCP route를 거치는 `project-connection`·`request-rate-limit`·`token-usage`
포함)과 Windows 역할 런타임·전체 프로젝트 빌드 리허설은 PR의 `check (server-integration)`과
`windows-role-runtime` CI에서 확인한다.

## 운영 반영과 남은 위험

- 운영 반영은 `dev`→`main` 승격이 필요하다. 이 시점의 `dev`에는 판을 올리지 않은 플러그인
  변경(#197, #200, #209)이 있어 승격에 plugin 0.5.19 판 상승이 함께 필요하다
  (`npm run verify:plugin-version`). 0.5.19 배포 시점은 별도 결정이다.
- 운영 반영 전까지 운영 서버는 `next@16.3.3`과 `@modelcontextprotocol/server@2.0.0`을 유지한다.

## 롤백

`package.json`과 `package-lock.json`을 이 변경 이전으로 되돌리고 `npm ci` 뒤 같은 검증을
실행한다.
