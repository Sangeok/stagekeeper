# 근거 — 왜 이 구조인가

규칙 자체는 [invariants.md](./invariants.md)와 [protocol.md](./protocol.md)에 있다.
여기에는 **그 규칙이 무엇을 겪고 생겼는지**만 둔다. 실행·판정 기록은
`docs/test-reports/`가 소유한다 — 이 문서는 그 보고서를 가리키는 요약이다.

## v1 → v2

| v1(ApcH 안에서) | v2(Stagekeeper) | 왜 |
| --- | --- | --- |
| 상태가 저장소의 md 두 개(`PROJECT_BOARD.md`·`TASK_BACKLOG.md`) | 서비스 DB | 여러 저장소를 하나의 하니스가 관리하고, 게이트를 웹에서 누른다 |
| 게이트를 프롬프트 문구로 막음 | 에이전트 토큰용 MCP 서버에 도구가 없음 | 문구는 어길 수 있지만 없는 도구는 부를 수 없다 |
| 명령 채널 = GitHub 이슈 | `Command` 테이블(Phase 3) | 이슈·PAT·루프 방지 접두가 은퇴한다 |
| 에이전트 정의를 손으로 씀 | `harness.json` → 템플릿 렌더 | 프로젝트마다 roster·검증 명령이 다르다 |

## 골든 diff — 통일 dev 템플릿이 원본과 어디서 갈라지나

(T1.15 Step 5가 채운다.)

## 첫 스모크 — Phase 1 완료 기준 실측

(T1.17이 채운다. 실행·판정 기록은 `docs/test-reports/`에 남기고 여기에는 요약과 링크만 둔다.)
