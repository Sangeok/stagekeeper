# 시스템 개요

## 제품 경계

Stagekeeper는 사람이 승인 게이트를 소유하고 에이전트가 계획, 독립 검증, 구현,
인수를 증거와 함께 수행하도록 조율하는 서비스다. 서비스는 Claude를 직접
실행하지 않는다. 사용자의 Claude Code가 플러그인과 MCP를 통해 Stagekeeper에
연결된다.

```text
[브라우저의 사용자]
        │ GitHub 로그인, 백로그 편집, 게이트 승인
        ▼
[Next.js Web / src/app + src/fsd]
        │
        ▼
[Application Services / src/server] ─────► [Postgres]
        ▲                                      상태의 진실
        │ MCP over HTTP, project token
[사용자의 Claude Code]
        ▲
        │ 로컬 설치·생성
[plugin + harness.json]
```

## 주체와 권한

| 주체 | 할 수 있는 일 | 할 수 없는 일 |
| --- | --- | --- |
| 웹 사용자 | 프로젝트·백로그 관리, 계획/구현 게이트, 반려·재개 | 에이전트 역할로 증거를 대신 작성 |
| Claude Code 에이전트 | MCP로 항목 조회·제안·보고·허용된 상태 전이 | 사람 전용 게이트 전이 |
| Stagekeeper 서버 | 인증·인가, 상태 기계, 동시성, 감사 이벤트 강제 | 사용자의 Claude 실행 |
| 플러그인 | 에이전트 정의·템플릿·MCP 연결을 사용자 저장소에 물질화 | 서비스 상태의 원본 보관 |

사람 전용 게이트는 프롬프트 관례가 아니라 서버의 도구 집합과 전이 규칙으로
강제한다. FSD 폴더 구조는 이 보안 경계를 대체하지 않는다.

## 데이터와 규칙의 소유권

| 대상 | 단일 소유 위치 | 이유 |
| --- | --- | --- |
| 프로젝트, 백로그, 보드, 게이트 이벤트, 보고 경로 | Postgres | 여러 세션과 기기에서 공유하는 상태의 진실 |
| 상태 전이·텍스트 제한 같은 순수 규칙 | `packages/core` | 웹과 MCP가 같은 판정을 재사용 |
| 인증·인가·트랜잭션·MCP 등록 | `src/server` | 런타임과 저장소에 결합된 application service |
| 화면 조합과 사용자 상호작용 | `src/fsd` | 제품 의미에 따라 응집된 프런트엔드 코드 |
| URL과 Next.js lifecycle | `src/app` | framework adapter이자 composition root |
| 계획서·행위자 상세 기록 | 연결된 사용자 저장소 | 코드 변경과 함께 검토되는 산출물 |
| 워크스페이스·검증 명령 | 사용자 저장소의 `harness.json` | 코드와 함께 변하는 코드 인접 설정 |

## 최상위 의존성

```text
src/app ─────► src/fsd
   │              │ api/*.server.ts 또는 "use server" adapter만
   └──────────► src/server ─────────► packages/core
                    │
                    ├───────────────► Prisma/Postgres
                    └───────────────► 외부 인증·MCP 라이브러리

src/fsd/pages → widgets → features → entities → shared

plugin ───────► packages/core의 배포용 복사본
packages/core ─X─► src, npm package
src/server ─X─► src/fsd
```

`src/app`과 서버 전용 FSD adapter가 조합을 담당한다. `src/server`가 UI 모델을
알게 하거나, entity가 feature를 import하게 해 순환을 만들지 않는다.

## 런타임 경계

- 기본은 React Server Component다. 상호작용이 필요한 가장 작은 leaf에만
  `"use client"`를 둔다.
- Client Component가 import하는 `index.ts`는 브라우저 안전해야 한다.
- DB, secret, `server-only` 코드가 필요한 export는 `index.server.ts`에서만
  공개한다.
- Route Handler와 page는 직접 정책을 재구현하지 않고 `src/server` 또는 FSD의
  server public API를 호출한다.
- object-level 인가는 실제 데이터를 읽거나 바꾸는 page, Route Handler, Server
  Action에서 수행한다. layout/proxy 검사만으로 대신하지 않는다.

## 배포 단위와 비배포 단위

현재 저장소는 단일 Next.js package다. `packages/core`와 `plugin`은 별도 npm
workspace가 아니라 같은 저장소의 배포 재료다. 서버 endpoint가 크게 늘거나
독립 배포가 필요해질 때만 backend package 분리를 새 ADR로 검토한다.
