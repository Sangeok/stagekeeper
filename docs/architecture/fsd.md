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
| `shared` | 제품 도메인을 모르는 기반 | `ui`(button·chip·field·card·code·table·section-label·copy-button·monogram — unit별 파일), `api`, `lib`(class-name·relative-time), `config`(light-palette — next/og 이미지용 토큰 값), `routes` | shared 내부 |

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

## 코드 배치와 추출 판단

1. 새 코드는 현재 책임을 소유한 page 또는 slice에 먼저 둔다. 전체 배치 순서는
   [아키텍처 개요](./README.md#새-코드를-둘-위치)를 따른다.
2. 한 slice 안에서 책임을 나눌 때는 파일이나 컴포넌트 분리부터 검토한다.
   내부 구현을 분리했다는 이유만으로 새 slice를 만들지 않는다.
3. 독립적인 제품 책임, 외부에 제공할 계약, 별도로 변경되는 이유가 명확하면
   사용처가 하나여도 별도 slice를 검토할 수 있다. 한 화면의 주된 내용이고
   그 화면과 함께 변경되는 UI는 page에 유지한다.
4. 재사용을 위해 추출할 때는 실제 소비처의 책임과 변경 방향이 같은지 확인한다.
   세 곳 이상의 반복은 검토 신호이며 필수 조건이나 자동 추출 조건은 아니다.
   대상 layer는 책임으로 결정하고, 모든 소비처가 허용된 방향으로 import할 수
   있어야 한다. 공통화 때문에 같은 layer의 slice를 서로 연결하지 않는다.

| 상황 | 배치 판단 |
| --- | --- |
| 한 화면에서만 사용하는 필터와 표시용 파생 로직 | 해당 page slice에 유지하고 필요하면 내부 파일로 분리한다 |
| 독립적인 사용자 동작과 공개 계약을 가진 게이트 승인 | `features/review-gate`처럼 동작을 소유하는 slice를 검토한다 |
| 여러 화면이 사용하는 보드 항목의 상태 표시 | `entities/board-item`처럼 해당 도메인을 소유한 slice에 둔다 |
| 제품 도메인을 모르는 날짜 포매터 | `shared/lib/relative-time`처럼 목적이 좁은 라이브러리를 검토한다 |

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
import { statusLabel } from "@/fsd/entities/board-item";

// Bad: entity가 더 높은 feature를 앎
import { AcceptanceFailure } from "@/fsd/features/review-gate";

// Bad: 다른 slice의 내부 구조에 결합
import { statusLabel } from "@/fsd/entities/board-item/model/status-label";

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

현재 `review-gate` public API 중 일부다. 내부 버튼과 provider에 의존하는 보조
컴포넌트를 전부 공개하지 않고, 외부 소비자가 실제로 쓰는 계약만 내보낸다.

```ts
// features/review-gate/index.ts
export { inboxReadOnlyLabel } from "./model/inbox-item";
export type { GateAction, InboxItem } from "./model/inbox-item";

// features/review-gate/index.server.ts
export { approveGate } from "./api/review-gate.server";
export { loadInboxItems } from "./api/inbox-data.server";
export { InboxCard } from "./ui/inbox-card";
```

### Shared의 공개 경로

`shared`는 slice 없이 `ui`, `lib`, `api` 같은 segment로 구성한다. segment끼리
상호 import할 수 있으며, 같은 layer의 slice 격리 규칙을 적용하지 않는다.
상위 layer import 금지와 Server/Client 경계는 그대로 적용한다.

unit은 버튼 하나나 날짜 포매터처럼 목적이 좁은 공개 단위다. `shared/ui`와
`shared/lib`가 커지면 거대한 barrel 대신 unit 경로를 사용한다. 한 파일로
충분하면 현재처럼 단일 파일을 유지하고, 구현이 나뉠 때만 폴더형을 사용한다.

| 형태 | 공개 진입점 예시 | `shared` 밖에서 사용하는 import 경로 |
| --- | --- | --- |
| segment public API가 있는 경우 | `shared/api/index.ts` | `@/fsd/shared/api` |
| 단일 파일 unit | `shared/ui/button.tsx` | `@/fsd/shared/ui/button` |
| 필요할 때 폴더로 구성한 unit | `shared/ui/button/index.ts` | `@/fsd/shared/ui/button` |

`shared` 밖에서는 segment 또는 unit의 공개 경로를 사용한다. 폴더형 unit도
`@/fsd/shared/ui/button`으로 import하며, 뒤에 `/index`나 `/button-style` 같은
내부 파일 경로를 붙이지 않는다. 현재 `shared` 내부의 상호 참조에는 unit별
접근 금지 규칙을 두지 않는다. 공개 경로 검사 범위는
[아키텍처 검증](./verification.md#fsd-규칙의-검증)을 따른다.

## Next.js App Router와 조합

`src/app`은 얇은 adapter다. route params를 해석하고, 목적지에서 인증·인가한 뒤,
서버 데이터를 FSD page에 넘기거나 page public API를 re-export한다. page 고유 UI,
표시용 파생 로직, feature 구현을 route 파일에 쌓지 않는다.

Route Handler도 같은 원칙으로 transport만 담당하고 `src/server`의 use case를
호출한다. Next.js 특수 파일의 실제 API는 반드시 설치된 버전의
`node_modules/next/dist/docs/`를 확인한다.

## Server와 Client 경계

- 기본은 Server Component다. event handler, 브라우저 API, local state가 필요한
  가장 작은 leaf만 Client Component로 만든다.
- `"use client"` 파일은 `@/server`, `index.server`, `*.server`를 import하지 않는다.
- FSD가 `src/server`를 호출해야 할 때는 `api` segment의 서버 전용 adapter에서만
  호출한다. 용도에 따라 아래의 서버 경계 표시를 사용하고, slice 외부에는
  `index.server.ts`로 공개한다.
- `src/server`는 FSD를 import하지 않는다. 서버가 UI 타입을 요구하면 그 타입의
  소유권이 잘못된 것이므로 순수 계약을 `packages/core` 또는 서버 모듈로 옮긴다.
- Server Component에서 Client Component로 전달하는 데이터는 React가 직렬화할
  수 있어야 한다. Server Function은 호출 가능한 참조로 전달된다. 일반 함수를
  prop으로 전달하거나 서버에서 만든 일반 콜백으로 Action을 감싸서 넘기지 않는다.

| 표시 | 용도 | 현재 예시 |
| --- | --- | --- |
| `import "server-only"` | 조회·서비스 adapter가 client module graph에 포함되는 것을 막는다. 원격 호출 가능한 함수를 만들지는 않는다 | `review-gate/api/inbox-data.server.ts` |
| `"use server"` | 클라이언트에서 호출할 수 있는 Server Function을 정의한다. 사용자 변경 동작의 Server Action에 사용한다 | `review-gate/api/review-gate.server.ts` |

Next.js는 파일 상단에 `"use server"`가 있는 모듈의 함수를 Client Component에서
직접 import하는 방식도 지원한다. Stagekeeper는 서버 public API를 서버 조합
지점에서 소비하고 Action을 prop으로 전달하는 정책을 사용한다. 위 직접 import
금지는 이 저장소의 정책이다. 일반 서버 조회 함수를 표시하기 위해
`"use server"`를 일괄 적용하지 않는다.

아래는 [현재 Inbox 라우트](../../src/app/(app)/p/[slug]/inbox/page.tsx)의 연결 방식이다.
라우트는 서버 public API를 import하고, Action에 `slug`를 bind한 뒤 page에 넘긴다.

```tsx
// src/app/(app)/p/[slug]/inbox/page.tsx
import {
  approveGate, discardItem, humanTransition, loadInboxItems,
} from "@/fsd/features/review-gate/index.server";
import { inboxReadOnlyLabel } from "@/fsd/features/review-gate";
import { ProjectInboxPage } from "@/fsd/pages/project-inbox/index.server";
import { requireProjectOwner } from "@/server/auth/guard";
import { projectAccess } from "@/server/projects/api.server";

export default async function Page({ params }: PageProps<"/p/[slug]/inbox">) {
  const { slug } = await params;
  const { projectId } = await requireProjectOwner(slug);
  const [items, access] = await Promise.all([
    loadInboxItems(projectId), projectAccess(projectId),
  ]);

  return (
    <ProjectInboxPage
      items={items}
      now={new Date().toISOString()}
      transition={humanTransition.bind(null, slug)}
      approve={approveGate.bind(null, slug)}
      discard={discardItem.bind(null, slug)}
      canWrite={access.available}
      readOnlyLabel={inboxReadOnlyLabel(access)}
    />
  );
}
```

`ProjectInboxPage`와 `InboxCard`는 전달받은 Action 참조를 그대로 넘긴다.
Client Component인 `InboxApproveControl`은 `approve` prop을 받아 호출하며 서버
모듈을 import하지 않는다. `() => approve(input)` 같은 이벤트용 콜백은 이 client
경계 안에서 만든다. 구현은
[Inbox 컨트롤](../../src/fsd/features/review-gate/ui/inbox-card-controls.tsx)을 따른다.

라우트의 인증·인가는 최초 화면 요청을 보호한다. 각 Action도 호출될 때마다
입력 검증과 인증·인가를 수행해야 하며, prop으로 전달하거나 `bind`했다는 사실이
이를 대신하지 않는다. 현재 `approveGate`는 `requireProjectWrite`와 입력 schema를
통과한 뒤 서버 use case를 호출한다.

## 상태와 데이터

상태는 실제 사용처에 가장 가까운 곳에 둔다.

- 서버 데이터: Server Component 또는 slice의 server API에서 읽고, 캐시·갱신
  규칙은 query와 함께 둔다.
- URL로 공유되어야 하는 상태: route/search params.
- 폼 상태: 해당 feature의 form과 schema 근처.
- 국소 UI 상태: 사용하는 Client Component.
- 여러 slice의 전역 store: 마지막 선택지. 도메인별 selector/atom으로 소비
  범위를 제한한다.

서로 다른 관심사를 하나의 hook이나 store에 합치지 않는다. 공통화는
[코드 배치와 추출 판단](#코드-배치와-추출-판단)을 따른다.

## 이름과 테스트

- 일반 파일과 폴더는 kebab-case를 사용한다.
- React symbol은 PascalCase, hook symbol은 `use...` camelCase를 사용하되 파일은
  `project-card.tsx`, `use-project-filter.ts`처럼 쓴다.
- 단위·컴포넌트 테스트는 대상 코드 옆에 둔다. 테스트의 이름·소유권·실행 환경별
  위치와 예외는 [테스트 코드 배치 규칙](./test-organization.md)을 따른다.
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
- 현재 slice 안에서의 분리로 충분한가? 새 slice나 공통 코드의 책임·공개 계약·
  변경 이유가 명확하고, 소비처의 의존 방향을 지키는가?

## 규칙 확인 방법

경계 규칙은 `npm run verify:fsd`, 검사기의 회귀 검증은
`npm run test:architecture`로 확인한다. 코드 변경에는 저장소가 요구하는 lint·타입·
관련 테스트·빌드 검증도 적용한다. 자동 검사 범위와 수동 리뷰 항목, 실행 명령의
상세는 [아키텍처 검증](./verification.md#fsd-규칙의-검증)이 소유한다.

## 참고 자료

- [FSD Layers](https://feature-sliced.design/docs/reference/layers)
- [FSD Slices and segments](https://feature-sliced.design/docs/reference/slices-segments)
- [FSD Public API](https://feature-sliced.design/docs/reference/public-api)
- [FSD Usage with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs)
- 설치된 Next.js 문서:
  `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`
- Server Function과 직렬화 경계:
  `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md`,
  `node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md`
- `server-only` 사용:
  `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
