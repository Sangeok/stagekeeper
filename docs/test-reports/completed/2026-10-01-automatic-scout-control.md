# 자동 발굴 표시와 소유자 제어 — 구현 검증

브랜치: `harness/automatic-scout-control` (`origin/dev`에서 생성).

## 구현

- Pipeline 시작 부분에 `Scout / feature-scout`와 빈 후보 백로그 조건을 표시한다.
- Free·Pro·Max에서 소유자가 자동 발굴을 즉시 켜거나 끈다. 저장된 항목 그래프와 버전은 바꾸지 않는다.
- 꺼진 동안 head는 수동 백로그 입력을 안내하고 독립 Scout의 단계 요청과 추가를 거부한다. 열린 독립 run도 설정 저장과 같은 transaction에서 닫는다.
- entry에 결합된 Scout 슬롯은 유지한다. 레거시 공유 run은 해당 백로그의 최신 항목이 실제 Scout 커서에 있을 때만 허용한다.
- 첫 실행과 Nothing open 배너도 꺼진 상태에 맞춰 안내한다.

## 검증

- `npm run check`: lint·타입·FSD·아키텍처·프로젝트 사용 상태 검사 통과.
- `npm run verify:fsd`, Prisma schema validate 통과.
- `npm run test:web`: 501개 통과.
- core/plugin 테스트와 server 단위 테스트 통과. 기존 운영 인수 조건에 따른 server 테스트 skip은 인수 완료로 계산하지 않는다.
- 격리 PostgreSQL 전체 integration migration·테스트 통과. 마지막 서버 변경 뒤 자동 발굴·백로그 추가·head 19개를 재검증해 모두 통과했다.
- 자동 발굴 integration 5개: Free 켜기/끄기·그래프 불변, 독립 run 종료·bound run 유지, 소유권/사용 상태, 레거시 슬롯과 최신 항목 범위, disable 뒤 경합 중 backlog_add 거부.
- fresh `npm run build` 통과.
- `scripts/rehearse-automatic-scout.ts` 실제 Next HTTP 인수 통과: Free 스위치 표시·저장·재조회, malformed Boolean, 타인/무세션/사용 불가 프로젝트 거부. action manifest와 실제 인증 cookie·POST를 사용했다.

시험 DB는 로컬 `127.0.0.1:55439/stagekeeper_test_auto_scout`다. 도구는 임시 폴더에만 설치했고 프로젝트 의존성·운영 DB는 변경하지 않았다. 각 인수 fixture는 정리했다.

## 운영 적용과 남은 확인

1. 승인된 배포 작업에서 `20261001000000_automatic_scout_control` migration을 먼저 적용한다. 기존 프로젝트의 기본값은 true다.
2. 새 서버를 배포한다. 새 서버를 migration 전에 실행하면 필요한 컬럼이 없어 오류가 난다.
3. 인증된 실제 브라우저에서 스위치 조작·pending/오류 표시·모바일 배치를 확인한다. 이번 인수는 실제 HTTP와 컴포넌트 handler 시험이며 브라우저 hydration·시각 인수를 대신하지 않는다.

되돌릴 때는 이전 서버로 돌아가고 추가 컬럼은 남긴다. 현재 작업에는 운영 migration·서버 배포·템플릿 재게시가 포함되지 않는다.
