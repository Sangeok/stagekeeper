# Next.js 16.4.2 → 16.4.6 보안 업그레이드

완료일: 2026-11-17. 기준: `dev` `9937829`.

## 목적

설치된 `next@16.4.2`가 npm 보안 권고의 영향 범위에 들어간다. 같은 메이저 안의 수정판
`16.4.6`(현재 `latest`)으로 올린다.

## 권고와 이 저장소의 노출

| 권고 | 영향 범위 | 이 저장소에서의 노출 |
| --- | --- | --- |
| Next.js: `unstable_cache()`로 부른 `'use cache'` 함수에서 root params가 섞여 정보가 노출됨 ([GHSA-mfr8-8qww-v76h](https://github.com/advisories/GHSA-mfr8-8qww-v76h), moderate, CWE-362) | `>=16.3.0 <=16.4.4` | `src`·`packages`에 `unstable_cache`와 `'use cache'`가 없다. 그래도 수정판으로 올린다 |

npm bulk advisory API(`/-/npm/v1/security/advisories/bulk`)는 `16.4.6`에 권고를 보고하지 않는다.

## 변경

| 패키지 | 이전 | 이후 |
| --- | --- | --- |
| `next` | `16.4.2` | `16.4.6` (정확한 판 고정 유지) |
| `eslint-config-next` (dev) | `16.4.2` | `16.4.6` |

`npm install --save-exact next@16.4.6 eslint-config-next@16.4.6`으로 바꿨다. lockfile에서는
`next`, `@next/env`, `@next/eslint-plugin-next`, `@next/swc-*`, `eslint-config-next`의 판만 바뀌었다.

`next.config.mjs`에 `experimental.agentUpgrade: "security"`를 명시했다. 16.4.0에서 추가된
옵션이며 기본값도 `security`라 동작은 같다. `next dev`·`next build`의 업그레이드 알림이
보안 권고만 기준으로 한다는 것을 설정에 드러낸다. Windows 역할 빌드의 `cpus`·`useTypeScriptCli`는
같은 `experimental` 안에서 `windowsRole`일 때만 더한다.

`docs/architecture/verification.md`의 Windows 역할 빌드 호환 경로 설명은 Next 판 표기만
16.4.6으로 바꿨다.

Next 16.4.6의 내장 문서(`node_modules/next/dist/docs`)를 16.4.2판과 비교했다. 바뀐 내용은
설명 보강과 Pages Router 이전 안내이며, 이 저장소가 쓰는 기능의 deprecation이나 제거는 없다.

## 결과

- `npm audit`에서 `next` 권고가 사라졌다.
- 남은 `npm audit` 결과는 이 변경과 무관하다. lockfile에서 판이 바뀐 패키지는 위 Next 계열뿐이다.
  운영 의존성에는 `zod` high 1건(GHSA-mrhx-c7xc-m3w5, `<4.6.6`)이 있다. 개발 의존성에는
  `typescript-eslint` → `minimatch` moderate 체인(GHSA-g3hv-75wg-m249)이 있다. 둘은 별도 작업으로 다룬다.

## 검증

로컬(Windows, Node 22.13.1, 이 변경의 worktree, 실제 `npm install`):

| 명령 | 결과 |
| --- | --- |
| `next --version` | `Next.js v16.4.6` |
| `npm run db:generate` | Prisma Client 7.10.1 생성 |
| `node scripts/plugin-lib.mjs --check`, `npm run lint`(`verify:fsd`·`verify:server`·`verify:shared` 포함) | 통과 |
| `npm run docs:check`, `npm run verify:ci-coverage` | 통과 |
| `next typegen`, `tsc --noEmit` | 통과 |
| `npm run test:scripts`(`test:architecture` 범위 포함) | 585개 중 572 pass, 3 fail, 10 skip |
| `npm test` | 655개 중 626 pass, 0 fail, 29 skip |
| `npm run test:web` | 839개 모두 pass |
| `npm run test:server` | 192개 중 190 pass, 0 fail, 2 skip. 건너뛴 build 뒤 manifest 검사 2개는 build 뒤 따로 실행해 pass |
| `npm run build` | Next.js 16.4.6 (Turbopack) production build, TypeScript, 정적 페이지 34개 통과 |
| `STAGEKEEPER_ROLE_SNAPSHOT=1 npm run build` | Windows 역할 경로(webpack, `cpus: 2`, `useTypeScriptCli` 끔) 통과 |
| `next start` 뒤 `/`, `/docs/security`, `/docs/approval-gates` | 모두 200 |

`test:scripts`의 실패 3개는 이 변경과 무관한 기존 Windows 로컬 실패다. 이 변경이 없는 같은
`HEAD` 사본에서도 똑같이 실패했다.

- `manage-task-worktrees.test.mjs`: symlink 생성 권한 없음(`EPERM`)
- `gate-record.test.mjs`: `core.autocrlf=true`로 CRLF checkout된 `action.yml`을 `\n` 기준으로 나눠 step 블록을 찾지 못함
- `template-release-cli.test.ts`: 템플릿 프로필의 POSIX 권한 검사

빌드는 Next 내부 환경 변수(`NODE_ENV=development`, `TURBOPACK=auto` 등)를 물려받은 셸에서
실패했다. 그 변수를 지우고 CI와 같은 환경에서 실행했다.

역할 빌드 호환 처리가 의존하는 `next/dist/build`의 `webpack-config.js`,
`webpack/loaders/next-swc-loader.js`, `swc/options.js`는 판 문자열을 빼면 16.4.2와 같다.
Windows 역할 런타임·전체 프로젝트 빌드 리허설과 PostgreSQL 통합 시험은 PR의
`windows-role-runtime`·`check` CI에서 확인한다.

## 운영 반영

운영 반영은 `dev`→`main` 승격이 필요하다. 이 변경은 `plugin/` 파일을 바꾸지 않으므로
플러그인 판 상승이 필요 없다.

## 롤백

`package.json`, `package-lock.json`, `next.config.mjs`를 이 변경 이전으로 되돌리고 `npm ci` 뒤
같은 검증을 실행한다.
