# 테스트 코드 배치 규칙

이 문서는 테스트 파일의 위치, 이름, 소유권과 의존성 경계를 정의한다.
단위·컴포넌트 테스트는 대상 코드 옆에 두고, 시스템 경계를 넘거나 별도 실행 환경이
필요한 테스트는 그 책임을 소유한 테스트 디렉터리에 둔다.

적용 범위는 `src/fsd`, `src/server`, `packages/core`, `plugin`, `scripts`, `tests`다.
FSD layer·slice 규칙은 `src/fsd`에만 적용한다. 생성물과 배포 복사본은 직접 수정하지
않고 원본에서 테스트한다. 선택 배경과 대안 비교는
[ADR-0002](../ADR/0002-test-code-organization.md)에 보존한다.

## 배치 판단

먼저 검증할 동작의 소유자를 찾고, 다음으로 필요한 실행 환경을 확인한다.
테스트가 여러 함수를 호출한다는 이유만으로 별도 통합 테스트 폴더로 옮기지 않는다.

| 검증 범위 또는 실행 조건 | 위치 | 판단 기준 |
| --- | --- | --- |
| 모델·schema·순수 함수의 단위 테스트 | 대상 파일과 같은 디렉터리 | 구현과 동작 계약을 함께 탐색한다 |
| 컴포넌트와 한 feature에서 완결되는 동작 테스트 | 소유 slice의 `ui`, `model`, `api` 등 대상 segment | 테스트를 위해 새 slice나 segment를 만들지 않는다 |
| 여러 feature를 조합하는 page/widget 테스트 | 조합을 소유한 page/widget의 대상 코드 옆 | 각 feature의 public API를 사용하며 같은 layer의 slice를 우회 연결하지 않는다 |
| 서버·core·plugin·검사 스크립트의 독립 테스트 | 원본 모듈 옆 | 테스트 위치를 이유로 제품 코드를 이동하지 않는다 |
| `server-only` bootstrap이 필요한 테스트 또는 DB 없는 서버 교차 모듈 테스트 | `tests/server/` | 서버 테스트 실행 환경과 조합 계약을 공유한다 |
| 실제 PostgreSQL을 사용하는 서버 통합 테스트 | `tests/server/integration/` | DB fixture·정리와 격리된 실행 환경이 필요하다 |
| 브라우저로 전체 사용자 흐름을 검증하는 E2E | `tests/e2e/` | 소스 파일 구조보다 사용자 시나리오를 기준으로 구성한다 |

브라우저에서 실행해도 한 컴포넌트의 동작만 검증하면 컴포넌트 테스트다.
E2E 여부는 브라우저 사용 자체가 아니라 검증 범위로 판단한다.

`tests/e2e/`는 신규 E2E suite를 도입할 때 사용할 위치 규칙이다. 현재 전용 E2E
runner나 CI job이 있다는 뜻은 아니다. 기존 `scripts/rehearse-*`와 서버 fixture를
이 규칙만으로 일괄 이동하지 않는다. 새 실행 환경이나 테스트 종류를 도입할 때
실행 명령과 CI 연결을 함께 마련하며, 빈 디렉터리를 미리 만들지 않는다.

## 기본 형태와 이름

단위·컴포넌트 테스트는 대상과 같은 디렉터리에 flat하게 둔다. 하나의 테스트
파일이 응집된 여러 모듈의 동작을 검증해도 된다. 구현 파일마다 테스트 파일을
기계적으로 만들거나, 위치를 맞추기 위해 테스트를 불필요하게 쪼개지 않는다.

```text
src/fsd/features/manage-project-connection/
├── model/
│   ├── project-connection-input.ts
│   ├── project-connection-input.test.ts
│   ├── project-connection-state.ts
│   └── project-connection-state.test.ts
├── ui/
│   ├── project-connection-control.tsx
│   └── project-connection-control.test.ts
├── index.ts
└── index.server.ts
```

- 파일명은 kebab-case로 쓰고 `<대상 또는 동작>.test.ts`, `.test.tsx`, `.test.mjs`처럼
  `.test`로 테스트임을 표시한다. 언어와 JSX 사용 여부에 맞는 확장자를 선택한다.
- 같은 대상의 테스트를 나눌 필요가 있으면 검증 책임을 이름에 드러낸다.
  예: `project-connection-state.reconnect.test.ts`.
- 실제 DB 테스트는 `project-connection.test.ts`처럼 검증할 서버 동작을 이름으로
  사용한다. 루트 테스트 디렉터리에 `src/` 전체 구조를 그대로 복제하지 않는다.
- E2E 이름과 확장자는 runner 도입 시 결정하되 사용자 흐름을 드러내고,
  파일 탐색 패턴에 실제로 포함되는지 확인한다.

문서가 허용하는 파일명과 현재 runner가 탐색하는 파일명은 별개다. 새 확장자나
하위 경로를 도입할 때 같은 변경에서 실행 패턴과 필요한 환경을 보완하고 해당
테스트가 실행됐음을 확인한다.
실행 명령의 기준은 [package.json](../../package.json), 검사 범위의 설명은
[verification.md](./verification.md#테스트-배치-규칙의-검증)를 따른다.

## Fixture·mock·helper

- 한 테스트에서만 쓰는 작은 setup과 데이터는 해당 테스트 파일 안에 둔다.
- 같은 소유 범위의 여러 테스트가 공유하는 보조 코드가 필요하면 가장 가까운
  `testing/` 디렉터리에 둔다. 예: `model/testing/project-connection-fixture.ts`.
  테스트 본문은 기본적으로 대상 파일 옆에 유지한다.
- 서버 테스트의 공통 bootstrap은 `tests/server/`, 공유 fixture는
  `tests/server/fixtures/`, DB 전용 보조 코드는 `tests/server/integration/`에서 관리한다.
- 특정 feature의 fixture를 재사용한다는 이유만으로 `shared`로 올리지 않는다.
  공통화는 실제 소비 범위와 FSD 의존 방향을 모두 만족해야 한다.
- 보조 파일은 `.test` 이름을 사용하지 않는다. 자동 생성 snapshot은 runner의
  규약을 따르되 새 경로가 아키텍처 검사와 충돌하면 정식으로 규칙을 조정한다.
- 임시 디렉터리는 운영 코드와 같이 `realpathSync(tmpdir())` 아래에 만든다. macOS의
  기본 임시 경로(`/var/folders/…`)는 `/private/var/…`의 별칭이라, 경로 별칭을
  거부하는 운영 검사에 걸려 CI(Linux)와 결과가 달라진다.

## 의존성 경계

1. 테스트는 운영 코드를 import할 수 있다. 운영 코드가 테스트 파일이나 테스트
   전용 fixture·mock·helper를 import하거나 재수출하는 것은 금지한다.
2. slice의 `index.ts`·`index.server.ts`에는 제품 소비자가 쓰는 API만 공개한다.
   테스트 편의를 위한 export를 추가하지 않는다.
3. 같은 slice의 테스트는 상대 경로로 내부 모듈을 검증할 수 있다. 다른 slice나
   FSD 외부에서 FSD 코드를 import할 때는 public API를 사용한다.
4. 테스트에도 [FSD 의존 방향](./fsd.md#import-규칙)을 적용한다. 테스트라는
   이유로 같은 layer의 다른 slice나 상위 layer에 의존하지 않는다.
5. 서버 bootstrap·DB fixture가 필요한 테스트를 Client Component의 module graph에
   연결하지 않는다. 테스트 실행 환경의 설정은 테스트 진입점에서 소유한다.
6. 서버의 같은 모듈 옆 시험은 상대 경로로 내부를 검증한다. 다른 모듈의 비공개
   구현이 필요한 시험·리허설은 [서버 내부 참조 목록](./server.md#내부-참조-시험-목록)에
   정확한 파일·모듈·이유를 기록한다. 공개 symbol은 제품 소비자로 정하며 시험 전용으로
   넓히지 않는다. `verify:server`는 미등록 참조와 사용하지 않는 목록 행을 거부한다.

파일이 가까이 있다는 사실과 런타임 의존성은 별개다. 테스트 파일을 별도 폴더에
두더라도 운영 코드에서 import하면 경계 위반이다. `tsconfig`에서 테스트를 제외하는
것만으로 이 경계를 보장할 수 없으며, 타입 검사를 분리한다면 테스트용 검사도 유지한다.

## 하위 폴더와 예외

기본 규칙은 대상 옆 배치다. 먼저 테스트 보조 코드만 `testing/`으로 묶는다.
그 이후에도 한 대상에 여러 테스트 파일·fixture·snapshot이 연결되어 탐색이
어려운 경우에는 같은 segment 안의 `tests/` 등으로 테스트를 묶을 수 있다.
이때 PR에 대상, 소유자, 분리 이유와 실행 명령을 기록하고 리뷰한다. 고정된 파일 수를
기준으로 전역 재배치하지 않는다.

FSD slice 바로 아래에 `tests` segment를 추가하지 않는다. `model/tests/`처럼
기존 segment 내부에서 소유권을 유지한다. 현재 FSD 검사기의 kebab-case 규칙상
`__tests__/`는 허용되지 않는다. 검사에 예외가 필요하면
[verification.md의 예외 정책](./verification.md#예외-정책)을 따르며 검사기를 우회하지 않는다.

새 테스트와 수정하는 테스트에 이 규칙을 적용한다. 기존 파일을 옮기는 작업은
실행 패턴·import·fixture 참조와 함께 검토한다. 자동 검사와 수동 리뷰의 구분은
[테스트 배치 규칙의 검증](./verification.md#테스트-배치-규칙의-검증)에 기록한다.
