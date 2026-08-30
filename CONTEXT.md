# Stagekeeper

사람의 승인 권한과 에이전트의 실행 권한을 분리하면서, 개발 작업이 계획에서
검증과 인수까지 이동하는 과정을 공유 상태로 관리하는 제품 도메인이다.

## Language

**프로젝트 (Project)**:
Stagekeeper가 하나의 파이프라인과 권한 경계로 관리하는 연결된 코드 저장소.
_Avoid_: 앱, 워크스페이스, 저장소 계정

**워크스페이스 (Workspace)**:
한 프로젝트 안에서 특정 경로, 담당 에이전트, 검증 명령이 함께 묶인 작업 영역.
_Avoid_: 프로젝트, 패키지

**백로그 항목 (Backlog Item)**:
아직 보드 흐름에 들어가지 않았거나 향후 작업 후보로 관리되는 요구 사항.
_Avoid_: 보드 항목, 이슈

**보드 항목 (Board Item)**:
계획, 검증, 구현, 인수의 상태 흐름을 가지는 실행 중이거나 완료된 작업 단위.
_Avoid_: 백로그 항목, 태스크 행

**게이트 (Gate)**:
다음 실행 단계로 진행할지 사람이 명시적으로 결정하는 승인 지점.
_Avoid_: 자동 전이, 에이전트 승인

**에이전트 (Agent)**:
정해진 역할과 도구 권한으로 보드 항목의 일부 책임을 수행하는 실행 주체.
_Avoid_: 사용자, 서비스

**검증 (Validation)**:
계획이 코드와 맞는지 독립된 맥락에서 확인하고 그 결과를 기록하는 행위.
_Avoid_: 구현 테스트, 승인

**증거 (Evidence)**:
보드 항목이 만들어지거나 상태를 주장할 때 근거가 되는 관측·진단 정보.
_Avoid_: 결과, 의견

**결과 (Result)**:
한 단계의 수행이 남긴 확인 가능한 산출물 또는 그 위치.
_Avoid_: 증거, 상태

**인수 (Acceptance)**:
에이전트의 보고를 대신 믿지 않고 변경·검증·기록을 직접 재현해 완료를 받아들이는
사람의 확인.
_Avoid_: 구현승인, 검증

## States

보드 항목의 상태. **식별자**는 DB에 저장되고 MCP가 돌려주며 템플릿이 참조하는 값이고,
**라벨**은 화면이 보여주는 영어 낱말이다(제품은 영어로 서비스한다 — `docs/conventions/product-copy.md`).
유일한 출처는 `packages/core/transitions.mjs`의 `STATUSES`; 라벨은
`src/fsd/entities/board-item/model/status-label.ts` 한 곳.

| 식별자 | 라벨 | 뜻 | 여기서 여는 사람 동작 |
| --- | --- | --- | --- |
| `proposed` | Proposed | pm이 올렸다. 계획 요청(게이트①)을 기다린다 | Request plan · Put on hold · Discard |
| `planning` | Planning | 계획을 요청했다. dev가 계획서를 쓴다 | — (에이전트 차례) |
| `in_review` | In review | 계획서가 제출됐다. 검증과 승인(게이트②)을 기다린다 | Approve implementation · Send back · Put on hold · Discard |
| `implementing` | Implementing | 구현을 승인했다. dev가 코드를 바꾼다 | — (에이전트 차례) |
| `done` | Done | 끝났고 인수됐다 | — |
| `on_hold` | On hold | 멈춰 있다. 재개하면 이어진다 | Resume planning · Resume implementation |

_Avoid_: 한국어 상태명(승인대기·계획지시·검토대기·구현승인·완료·보류 — v1/ApcH 시절의 이름), 라벨을 식별자 자리에 쓰기
