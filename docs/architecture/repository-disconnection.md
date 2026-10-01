# 저장소 연결 해제와 재연결

현재 구현 계약과 운영 배포 절차다. 설계 근거는 [최초 제안서](../proposals/active/2026-09-27-repository-disconnection.md), 최초 실행 증거는 [검증 보고서](../test-reports/active/2026-09-27-repository-disconnection.md)에 둔다. 2026-10-01 사용자 결정으로 기능 스위치를 제거했다. 과거 기록의 스위치 정책보다 이 문서의 현재 계약을 따른다.

## 상태와 권한

`Project.disconnectedAt === null`이면 연결됨, 값이 있으면 해제됨이다. 해제된 프로젝트는 반드시 `available=false`다. 사용 가능 집합은 연결된 프로젝트의 부분집합이며 0개 연결·0개 선택도 정상이다. 등록과 재연결은 연결된 개수로 플랜 상한을 검사한다. 다운그레이드로 상한을 넘는 연결은 보존하지만 사용 가능 개수는 상한을 넘지 않는다.

해제는 프로젝트 id/slug/소유자/repository/branch와 Workspace·Backlog·Board·이벤트·보고서·Command·AgentRun/Step·PipelineVersion/Run을 보존한다. 소유자의 상세 7개 GET과 History Items/펼침/Events/독립 cursor/기간 제한도 보존한다. GET은 상태·version·token·run을 쓰지 않는다. 다른 사용자와 무세션의 상세 접근은 기존 방식으로 거부한다.

해제 시 해당 프로젝트의 미폐기 hs_/ho_만 같은 transaction에서 폐기한다. 기존 폐기 시각·다른 프로젝트 token·hu_는 유지한다. 모든 agent 도구와 owner 도구, identity/templates/runbook은 새 요청의 disconnected 접근을 거부한다. 폐기 hs_/ho_는 일반 401이며 저장소 정보를 주지 않는다. 유지된 hu_의 도구 응답은 정확한 사유만 준다:

`This repository is disconnected. Open Stagekeeper → Projects and choose Reconnect repository.`

소유자의 동일 repository 등록은 409 `{ error, reconnectPath }`로 명시적 웹 재연결을 안내한다. 대소문자 중복 repository가 2개 이상이면 409 `{ error }`의 무결성 오류로 거부하고 임의로 하나를 선택하지 않는다. 등록·init·sync가 자동 재연결하지 않는다.

재연결은 웹 세션의 소유자만 수행한다. 기존 프로젝트를 `available=true`로 복원하고 선택 시각을 갱신한다. 폐기된 credential은 복원하지 않으며 초기 token이나 새 프로젝트도 만들지 않는다. hu_는 그대로 사용할 수 있고 hs_/ho_는 웹 Tokens에서 다시 발급한다.

이미 접근 검사를 통과한 요청은 해제 후에도 완료될 수 있다. 소유자 잠금 안에서 다시 검사하는 기존 writer는 새 상태를 보고 거부한다. 이 기능은 로컬 Claude Code를 종료하거나 파일을 지우지 않는다.

## 저장 경계와 웹 경계

쓰기 순서는 입력 검사 → Serializable transaction → User 행 잠금 → 소유 snapshot/대상 → expectedVersion → repository 중복 → no-op → 상태/token → version CAS/event → commit이다. 등록·플랜 변경·사용 선택·token 발급도 같은 User 잠금을 먼저 얻는다. 읽기 전용 snapshot은 이 잠금을 얻지 않는다. P2034/AvailabilityConflict 및 raw lock의 P2010 SQLSTATE 40001/40P01은 최대 3회, 100/200ms 대기로 재시도한다. 다른 P2010과 event/CAS 뒤 오류를 transaction 안에서 성공 결과로 바꾸지 않는다.

해제·복원은 선택 집합 변경이 없어도 version과 event를 한 번 남긴다. event.reason은 `disconnect-project`/`reconnect-project`, actor는 user, targetProjectId는 대상 id다. targetProjectId는 감사 식별자이며 FK/cascade가 없다. 최신 version의 반복은 no-op, 이전 version의 반복은 먼저 stale이다.

새 FSD feature `manage-project-connection`은 자기 model/UI/action을 소유한다. `index.ts`는 client-safe API, `index.server.ts`는 두 mutation·ordinary loader·배너를 제공한다. adapter는 module-level `server-only`, 두 mutation만 inline `use server`다. mutation이 requireUser에서 얻은 userId를 주입하며 client userId와 bearer는 웹 세션을 대신하지 않는다.

성공/no-op은 `/projects`와 `/(app)/p/[slug]` layout을 재검증한다. stale/결과 불명에서는 확인 창을 닫고 로컬 상태를 버린 뒤 refresh한다. 확인 UI key는 대상/version/plan에 묶인다. 다른 브라우저의 즉시 갱신은 보장하지 않는다.

## 마이그레이션과 유지보수

`20260927000000_repository_disconnection`은 nullable disconnectedAt/targetProjectId, owner/disconnectedAt 인덱스, `Project_disconnected_available_check`만 추가한다. 기존 18개 모델과 FK/unique/index 및 이전 SQL은 유지한다.

cleanup checker는 새 열의 nullable/default/type, CHECK 표현식·검증 상태, 인덱스의 실제 두 열·유효성·비고유·비부분·비표현식 구조를 확인한다. 완전한 새 capability에서만 빈 사용 가능 집합을 허용한다. 일부만 적용된 schema는 실패한다. legacy D2/pre/post 검사와 catalogFingerprint의 key·과거 recovery checksum 계약은 유지한다.

이전 SQL 체인 리허설은 격리 schema의 전용 pg connection에서 파일 전체를 순서대로 실행한다. 세미콜론 분할이나 바깥 단일 transaction으로 DO/BEGIN/COMMIT을 감싸지 않는다. 마지막에 열린 transaction을 rollback하고 원래 search_path를 복원하며 자기 schema만 지운다. 직접 SQL 실행은 Prisma migration 원장을 만들지 않는다. 현재 checker/앱 검증은 정상 migrate deploy한 별도 테스트 DB에서 수행한다.

## 운영 배포

연결 해제·재연결은 배포된 코드에서 항상 제공한다. 별도 환경 변수나 활성화 단계는 없다. 소유자 웹 세션, 입력·version·무결성 검사와 재연결의 플랜 한도 검사는 적용한다. UI는 처리 중인 요청과 재연결 한도 때문에만 해당 버튼을 비활성화한다.

1. 운영 schema·대소문자 중복 repo·available 집합·최신 event/version을 읽기 전용으로 검사한다. backup 복원 리허설과 복구 가능한 호환 artifact를 기록한다. 중복은 임의 병합하지 않는다.
2. 모든 웹/REST/MCP/운영 writer 인스턴스와 이미 승인된 요청을 drain한다. 이전 코드가 새 빈 집합/해제 상태에 쓰지 못하도록 전체 배포를 맞춘다.
3. 쓰기 요청을 재개하기 전에 additive migration을 적용하고 전체 호환 bundle을 배포한다. cleanup post 검사에서 complete capability, exact set/event, 기존 보존 데이터를 확인한다.
4. 플러그인 0.3.6을 배포하고 설치된 버전을 확인한다. 기존 설치본은 자동 갱신되지 않는다. 본 작업은 private template 원문이나 marketplace의 `source: ./plugin`을 변경하지 않는다.
5. 소유자·타인·무세션·bearer-only·stale·한도와 API/MCP 인증을 대상 환경에서 검증한다. 실제 등록 거부, CLI templates 무쓰기 및 runbook 거부 이후 파일 보존/후속 단계 중단도 확인한다.
6. A 해제 → B 연결 → B 해제 → A 재연결을 인수한다. hs_/ho_ 폐기·hu_ 유지·History 보존을 다시 확인한다.

## 문제 발생 시

배포 환경에서 쓰기 요청을 중단하고 진행 중인 요청을 drain한다. 해제된 데이터는 그대로 보존하고 접근 차단을 유지한다. state-aware 호환 bundle으로 전환한다. 단순히 예전 코드로 돌아가거나 disconnectedAt을 null로 만들고 credential을 살리는 방법은 사용하지 않는다. 새 열과 event/폐기 token을 보존한 복구 또는 검증한 전체 backup 복원은 운영 증거와 별도 승인이 필요하다.

과거 `restore-d2-shadow.sql`은 D3 cleanup의 고정 artifact용 보상 절차다. RDC schema의 rollback으로 실행하지 않는다. 운영 DB 복원·push·배포는 로컬 구현 작업에 포함되지 않는다.
