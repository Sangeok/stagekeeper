# Feature-Sliced Design 규칙

## 적용 범위와 변형

FSD는 `src/fsd` 아래의 프런트엔드 제품 코드에 적용한다. `src/app`은 Next.js App
Router, `src/server`는 backend application service, `packages/core`는 순수 domain
kernel이므로 FSD layer가 아니다.

공식 FSD의 `app`·`pages` 이름은 Next.js의 예약 폴더와 충돌한다. Stagekeeper는
기존 Phase 0·1 경로 계획을 유지하기 위해 `src/fsd`를 별도 root로 두고, FSD
`App` 책임은 Next.js `src/app`이 맡는다. FSD `Pages`는
`src/fsd/pages`로 둔다. `processes` layer는 사용하지 않는다.

필요한 layer만 만든다. 빈 layer나 미래를 위한 빈 slice는 만들지 않는다.

## Layer와 프로젝트 slice

| Layer | 책임 | Stagekeeper 후보 | 아래로 import 가능 |
| --- | --- | --- | --- |
| `pages` | 라우터에 연결할 완전한 화면 | `project-list`, `project-board`, `project-inbox`, `project-backlog`, `project-tokens`, `board-item` | widgets, features, entities, shared |
| `widgets` | 여러 화면에서 재사용하거나 화면 안에서 독립적인 큰 블록 | `app-header`, `turn-banner`(현재) · 후보 `inbox-list` | features, entities, shared |
| `features` | 사용자가 가치 있다고 인식하는 동작 | `create-project`, `manage-token`, `edit-backlog`, `review-gate` | entities, shared |
| `entities` | 도메인 명사, 표시와 안정적인 모델 | `project`, `backlog-item`, `board-item`, `workspace`, `report` | shared |
| `shared` | 제품 도메인을 모르는 기반 | `ui`(button·chip·field·card·code·table·section-label·copy-button — unit별 파일), `api`, `lib`(class-name·relative-time), `config`, `routes` | shared 내부 |

후보 이름은 확정 디렉터리 목록이 아니다. 기능을 만들 때 실제 책임이 생긴
slice만 추가한다. 예를 들어 한 page에서만 쓰는 보드 UI는 재사용 가능성을
상상해 widget으로 올리지 않고 page slice에 둔다.

## Slice와 segment

`pages`, `widgets`, `features`, `entities`의 바로 아래 폴더는 제품 의미를 나타내는
slice다. slice 안에서는 다음 segment를 필요할 때만 사용한다.

| Segment | 내용 |
| --- | --- |
| `ui` | 컴포넌트, 화면 표시, loading/error 표현 |
| `model` | 타입, schema, 순수 상태·파생 로직 |
| `api` | 네트워크 호출, Server Action, runtime adapter |
| `lib` | 이 slice에서만 쓰는 작은 라이브러리 |
| `config` | slice flag와 설정 |

`components`, `hooks`, `types`, `utils`처럼 코드의 형태만 말하는 segment는 쓰지
않는다. `shared/lib`의 각 라이브러리도 `date`, `text`, `class-name`처럼 한 가지
목적을 이름으로 드러낸다.

```text
src/fsd/features/review-gate/
├── api/
│   └── review-gate.server.ts
├── model/
│   ├── gate-text.ts
│   └── gate-text.test.ts
├── ui/
│   └── gate-transition-button.tsx
├── index.ts
└── index.server.ts
```

관련 UI, 모델, 테스트, schema, action은 같은 slice에 둔다. 수정할 때 함께 찾아야
하는 파일이 여러 전역 디렉터리에 흩어지지 않게 하는 것이 우선이다.

## Import 규칙

의존성은 높은 layer에서 낮은 layer로만 흐른다.

```text
pages → widgets → features → entities → shared
```

- 낮은 layer는 높은 layer를 import할 수 없다.
- 같은 layer의 다른 slice를 import할 수 없다. 두 feature의 조합은 widget이나
  page에서, 두 entity의 상호작용은 feature 이상에서 맡는다.
- 같은 slice 안에서는 상대 경로를 사용한다.
- 다른 slice를 사용할 때는 `@/fsd/...` 절대 경로와 대상 public API를 사용한다.
- entity 간 관계가 정말 불가피하면 FSD의 `@x` API를 새 ADR 또는 명시적
  architecture review 후 도입한다. 현재 검사기는 기본적으로 허용하지 않는다.

```ts
// Good: feature가 더 낮은 entity의 public API를 사용
import { BoardItemCard } from "@/fsd/entities/board-item";

// Bad: entity가 더 높은 feature를 앎
import { ReviewGateButton } from "@/fsd/features/review-gate";

// Bad: 다른 slice의 내부 구조에 결합
import { toBoardItem } from "@/fsd/entities/board-item/model/board-item";

// Good: 같은 slice 내부는 상대 경로
import { gateLabel } from "../model/gate-text";
```

## Public API

모든 non-empty slice는 `index.ts`, `index.tsx`, `index.server.ts` 중 필요한 public
API를 가진다. 외부 소비자는 public API만 사용한다.

- `index.ts`: Client Component에서도 안전한 export만 둔다.
- `index.server.ts`: DB 접근, Server Component, Server Action 등 서버 전용
  export를 둔다.
- `export *`를 사용하지 않는다. 공개할 symbol을 명시한다.
- slice 내부에서 자기 `index.ts`를 import하지 않는다. 순환을 막기 위해 실제
  파일의 상대 경로를 사용한다.
- `shared/ui`와 `shared/lib`가 커지면 거대한 barrel 하나 대신
  `shared/ui/button`, `shared/lib/date` 같은 unit별 public API를 둔다.

```ts
// features/review-gate/index.ts
export { GateTransitionButton } from "./ui/gate-transition-button";
export { gateLabel } from "./model/gate-text";

// features/review-gate/index.server.ts
export { reviewGate } from "./api/review-gate.server";
```

## Next.js App Router와 조합

`src/app`은 얇은 adapter다. route params를 해석하고, 목적지에서 인증·인가한 뒤,
서버 데이터를 FSD page에 넘기거나 page public API를 re-export한다. page 고유 UI,
표시용 파생 로직, feature 구현을 route 파일에 쌓지 않는다.

```tsx
// src/app/(app)/p/[slug]/page.tsx
import { ProjectBoardPage } from "@/fsd/pages/project-board";
import { requireMember } from "@/server/auth/guard";
import { getProjectBoard } from "@/server/pipeline/queries";

export default async function Page({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const member = await requireMember(slug);
  const board = await getProjectBoard(member.projectId);

  return <ProjectBoardPage board={board} />;
}
```

Route Handler도 같은 원칙으로 transport만 담당하고 `src/server`의 use case를
호출한다. Next.js 특수 파일의 실제 API는 반드시 설치된 버전의
`node_modules/next/dist/docs/`를 확인한다.

## Server와 Client 경계

- 기본은 Server Component다. event handler, 브라우저 API, local state가 필요한
  가장 작은 leaf만 Client Component로 만든다.
- `"use client"` 파일은 `@/server`, `index.server`, `*.server`를 import하지 않는다.
- FSD가 `src/server`를 호출해야 할 때는 `api` segment의 서버 전용 adapter에서만
  호출한다. 파일에는 `"use server"` 또는 `import "server-only"`가 있어야 하고,
  외부에는 `index.server.ts`로 공개한다.
- `src/server`는 FSD를 import하지 않는다. 서버가 UI 타입을 요구하면 그 타입의
  소유권이 잘못된 것이므로 순수 계약을 `packages/core` 또는 서버 모듈로 옮긴다.
- Server Component에서 Client Component로 전달하는 값은 직렬화 가능해야 한다.

## 상태와 데이터

상태는 실제 사용처에 가장 가까운 곳에 둔다.

- 서버 데이터: Server Component 또는 slice의 server API에서 읽고, 캐시·갱신
  규칙은 query와 함께 둔다.
- URL로 공유되어야 하는 상태: route/search params.
- 폼 상태: 해당 feature의 form과 schema 근처.
- 국소 UI 상태: 사용하는 Client Component.
- 여러 slice의 전역 store: 마지막 선택지. 도메인별 selector/atom으로 소비
  범위를 제한한다.

서로 다른 관심사를 하나의 hook이나 store에 합치지 않는다. 공통화는 세 곳
이상에서 같은 책임과 같은 변경 방향이 확인된 뒤에 한다.

## 이름과 테스트

- 일반 파일과 폴더는 kebab-case를 사용한다.
- React symbol은 PascalCase, hook symbol은 `use...` camelCase를 사용하되 파일은
  `project-card.tsx`, `use-project-filter.ts`처럼 쓴다.
- 테스트는 대상 옆에 `<name>.test.ts(x)`로 둔다.
- Next.js 예약 파일(`page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`,
  `error.tsx`, `not-found.tsx`, `default.tsx`)은 framework 이름을 그대로 쓴다.
- `temp.ts`, `helpers.ts`, `types.ts` 같은 맥락 없는 이름은 피한다. `types.ts`는
  slice 전체 계약을 실제로 대표할 때만 허용한다.

## 코드 리뷰 질문

- 이 코드는 사용자/제품 의미가 같은 파일과 함께 있는가?
- 변경의 영향 범위가 현재 slice 밖으로 불필요하게 퍼지는가?
- 더 낮은 layer가 더 높은 layer 또는 같은 layer의 다른 slice를 아는가?
- 외부 import가 public API를 통과하는가?
- `src/app` 또는 `"use client"` 경계가 필요 이상으로 넓은가?
- 서버 전용 코드가 client public API로 새지 않는가?
- 아직 한 곳에서만 쓰는 코드를 성급하게 feature/widget/shared로 올리지 않았는가?

## 참고 자료

- [FSD Layers](https://feature-sliced.design/docs/reference/layers)
- [FSD Slices and segments](https://feature-sliced.design/docs/reference/slices-segments)
- [FSD Public API](https://feature-sliced.design/docs/reference/public-api)
- [FSD Usage with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs)
- 설치된 Next.js 문서:
  `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`
