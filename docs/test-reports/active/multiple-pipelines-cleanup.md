# Multiple pipelines — Phase 6 cleanup 구현·검증

2026-10-15 사용자 후속 지시로 [제안서](../../proposals/active/multiple-pipelines.md)의
Phase 6을 별도 브랜치 `harness/multiple-pipelines-cleanup`에 준비했다.
기준은 첫 release 커밋 `02f0403`이며 작업 경로는
`C:/Users/hamso/AppData/Local/Temp/mp6wt`다.
첫 release 브랜치 `harness/multiple-pipelines`와 원래 checkout의 미커밋 작업은 변경하지 않았다.

## 구현

- `20261015010000_pipeline_version_owner_required/migration.sql`에 제안서의 B SQL을
  그대로 추가했다. null 실행 판이 하나라도 있으면 명시적으로 전환을 거부하고,
  없으면 `PipelineVersion.pipelineId`에 NOT NULL을 적용한다. 자동 backfill은 하지 않는다.
- Prisma의 `pipelineId`와 `pipeline` 관계를 필수로 만들고 client를 재생성했다.
  생성 모델 수는 23이다. `Project.defaultPipelineId`의 지연 생성 계약은 유지한다.
- `integration/support.ts`의 `seedPipelineVersion`은 같은 프로젝트 Default·정의·실행 판을
  하나의 transaction으로 만든다. 기존 실행 그래프의 legacy 노드·format은 보존하며
  정의에서만 `propose`를 제외한다. 6개 통합 테스트 파일과 3개 리허설이 이 helper를 사용한다.
- 첫 release에 추가된 overflow fixture도 소유 Pipeline을 갖도록 고쳤다. 다른 Pipeline이
  프로젝트 최대 번호를 점유한 상태에서 기본 Pipeline 물질화가 전체 rollback되는지를 유지한다.
- fifth-pass 리허설의 `proposeItem` 요청에도 현재 계약의 필수 `pipelineId`를 넣었다.
  최초 재실행에서 구형 요청 형식 때문에 owner 대조군이 실패해 확인한 누락이며,
  누락·null·숫자·빈 문자열 Pipeline 입력이 거부되는 경우도 함께 검사한다.
- B migration 시험은 B 이름보다 앞선 전체 migration을 재생한다. 기존 역사 migration 시험과
  migration A SQL은 수정하지 않았다. 롤백 SQL은 제안서에서 읽어 B 전·후 모두 실행한다.

## 검증 결과

격리 PostgreSQL 18.4를 `127.0.0.1:55435`에서 사용했다. Phase 6 전용 DB는
`stagekeeper_test_multiple_pipelines_phase6`, 전체 migration 재생용 빈 DB는
`stagekeeper_test_multiple_pipelines_phase6_slots`다. 운영 URL·데이터는 사용하지 않았다.

| 검사 | 결과 |
| --- | --- |
| Prisma generate / validate / migrate deploy | 통과, A·B 포함 전체 체인 적용 |
| core·plugin 전체 | 347 통과, 기존 환경 조건 skip 2 |
| web 전체 | 598 통과 |
| server 전체, fresh action manifest 포함 | 64 통과, 별도 opt-in inbox manifest skip 1 |
| PostgreSQL integration 전체 | 131 통과, 실패·skip 0 |
| `npm run check` | lint·FSD·Next typegen·tsc·architecture·availability 모두 통과 |
| architecture (`check` 안에서 실행) | 44 통과, 기존 LPAC 환경 조건 skip 2 |
| project availability (`check` 안에서 실행) | 18 통과 |
| 별도 `verify:fsd` / production build | 통과 |
| 제안서의 제거 심볼·경로·문구 검사 3개 | 모두 검색 결과 없음, 정상 검색 종료값 확인 |
| migration B SQL / A 보존 / 첫 release 분리 | 제안 SQL 일치, A와 역사 시험 불변, 첫 release 커밋에 B 없음 |

새 migration·rollback 검증은 다음을 실제 PostgreSQL에서 확인했다.

- A 이후 구형 writer의 null 실행 판이 있으면 B가 실패하고 데이터·컬럼·FK·인덱스가 보존된다.
- 정상 B는 실행 판과 기존 run·이벤트·에이전트·보고 원장을 보존하고 필수 제약만 추가한다.
  누락/null writer는 23502, 존재하지 않는 Pipeline은 23503으로 거부된다.
- non-null writer는 성공하고 새 Project의 기본 Pipeline은 계속 지연 생성할 수 있다.
- B 전·후 롤백은 PM 설정 true/false, 다른 Pipeline이 프로젝트 최대 판인 경우,
  legacy `propose` 제거, 기존 실행 원장 보존을 처리한다.
- 롤백 후 구형 저장·새 프로젝트 물질화가 가능하며, 생성된 null 때문에 B SQL도 다시 실패한다.
  재도입에는 제안서대로 새 보상 migration이 필요하다. 기록된 A·B를 다시 적용하는 절차가 아니다.
- 번호 overflow로 롤백이 거부되면 판과 B의 NOT NULL 제약까지 그대로 유지된다.

실제 production Next 서버의 HTTP 리허설도 통과했다.
`rehearse-multiple-pipelines.ts`는 8개 action, 소유자·비소유자·비로그인,
Free 편집 거부와 항목 선택·변경, 미선택·연결 해제 거부, 5개 페이지 본문,
stale와 읽기 요청의 무변경을 검증했다. `rehearse-acceptance-failure.ts`는
인수 실패·retry·응답 유실·중복 거부를, `rehearse-pipeline-agent-slots.ts`는
전체 migration·상한 경쟁·실행 결합·감사 rollback·삭제 관계를 통과했다.
`rehearse-src-clean-code-fifth-pass.ts`도 입력 계약 수정 후 HTTP·Flight·본문·cleanup
검사 61개를 통과했다. 마지막 스크립트 변경의 focused lint와 tsc도 통과했다.

로그는 작업 세션의 Temp `mp6-{core,web,manifest,integration,check,build,http,acceptance,slots,fifth}.log`,
fifth-pass 상세 결과는 `mp6-fifth-report.md`에 있다.
새 worktree에서 Next route 타입 생성 전 단독 tsc는 `PageProps`/`LayoutProps` 부재로 실패했다.
이후 정상 순서의 `check`(typegen → tsc)와 production build가 모두 통과했다.

## 통합·배포 조건

이 결과는 로컬 구현 준비 완료에 대한 증거다. push·PR·merge·운영 DB 변경·배포는 수행하지 않았다.
시작 시 조회한 원격 dev는 `645e312`로, 첫 release의 기준 dev 이후 별도 변경들이 있다.
따라서 첫 release를 실제 dev와 통합·검증·병합한 뒤 cleanup 커밋만 그 dev 위에 재배치하고
검증을 다시 수행한다. 후속 PR의 대상도 dev다. 첫 release PR에 B를 섞지 않는다.

운영 순서는 제안서대로 maintenance·backup·구형 writer 종료 → A → nullable 서버 →
B → 필수 schema 서버다. B 적용 직전 대기 migration이 B 하나인지, 구형 인스턴스가
종료됐는지 확인해야 한다. 운영 적용과 인수가 남아 제안서와 이 보고서를 active에 유지한다.
