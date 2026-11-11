---
status: "completed"
stage: null
result: "pass"
report-kind: "acceptance"
report-size: "compact"
test-levels: ["end-to-end", "manual"]
test-tools: ["GitHub Actions template-release.yml", "template CLI in WSL Ubuntu 26.04.1 (Node 22.13.1)", "pg read-only queries", "pg_dump and pg_restore 18", "Claude Code 2.1.318 headless", "harness 0.6.1 Windows bundle"]
created-at: "2026-11-05"
completed-at: "2026-11-05"
last-executed-at: "2026-11-05T13:02:13Z"
tested-revision: "9516f1db5f4adf6bccd60e0ae121d321935e9e14"
owners: ["user:Sangeok"]
related: ["docs/proposals/completed/2026-11-05-template-release-production-cutover.md", "docs/proposals/completed/2026-11-11-template-release-versioning.md", "docs/architecture/template-releases.md"]
primary-area: "harness/template-releases"
observed-environments: ["production | Neon PostgreSQL 18.6 and Vercel production | GitHub Actions ubuntu-latest | single owner account", "local | Windows 11 with WSL Ubuntu 26.04.1 | Claude Code 2.1.318 with harness 0.6.1 bundle | owner"]
test-summary: "pass: production R0 cutover, run pins and the 0.6.1 client path on this PC — the channel is versioned at revision 1 and pipeline_next answers with R0"
follow-up: ["docs/proposals/active/template-release-acceptance-follow-ups.md"]
---

# 템플릿 릴리스 운영 전환(R0) 인수

## Summary and Decision

운영 DB를 versioned R0로 전환했고, 이 PC의 클라이언트를 0.6.1로 바꿔 동작을 확인했다. 운영 서버는 main `9516f1d`에서 돈다. 이 결과로 원 제안서 TPL4의 R0 전환이 끝났다. R1 활성화와 포인터 복구(Phase H)는 별도 승인 대상으로 남는다. 절차와 단계별 기록은 [운영 전환 계획](../../proposals/completed/2026-11-05-template-release-production-cutover.md)에 있다.

## Scope and Criteria

포함 범위: 운영 마이그레이션, main 승격과 배포 대조, 워크플로의 status·bootstrap, 전환 뒤 채널·pin, 이 PC의 번들 설치·재init·`pipeline_next`.

제외 범위:

- `agent_next`와 새 AgentRun의 R0 pin. 역할을 실제로 띄워야 해서 첫 실제 실행에서 확인한다. CI pipeline-smoke 41991608561이 같은 판과 같은 R0 템플릿으로 배정부터 인수까지 확인했다.
- Codex 경로와 다른 기기
- Phase H

| 기준 ID | 기준 | 확인 기준 |
| --- | --- | --- |
| R1 | 계획서 E·F 단계 | 운영 쓰기가 승인된 순서대로 성공하고, 실패한 시도는 운영을 바꾸지 않는다 |
| R2 | 계획서 F10, `template-releases.md` | versioned, revision 1, active R0, legacy 장벽 true, 같은 요청의 result 일치, 열린 실행 전부 pin |
| R3 | 계획서 G1~G3 | 설치 캐시가 번들과 같고, 재init이 ready가 되고, 새 Claude 세션의 `pipeline_next`가 R0로 응답한다 |
| R4 | 계획서 F9·G7 | 비공개 snapshot의 전달 경로와 일회성 secret이 남지 않는다 |

## Test Target and Preconditions

- 운영 DB는 Neon 운영 브랜치(PostgreSQL 18.6)다. 전환 전 템플릿 13행은 비공개 템플릿 `fb6ef955`과 같았다.
- 서버는 main `9516f1d`다. `3e69c58`에 시험 수정 하나(#292)를 더한 커밋이고, 출하 플러그인과 서버 코드는 같다.
- 클라이언트는 이 PC의 `harness@stagekeeper-windows` 0.6.1이다. 번들은 `3e69c58`에서 패키징했다.
- 연결 저장소는 harness-smoke와 mathgic이다.
- 사전 조건: 전환 시점에 운영 사용자는 1명이었고, 실행기 0개, 열린 AgentRun 0개, 마지막 쓰기는 약 5시간 전이었다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 실제 결과 | 판정 |
| --- | --- | --- | --- | --- | --- |
| T1 | R1 | `required` | 운영 `migrate deploy` | 미적용 2개를 재확인한 뒤 적용했다(17.5초). 이후 up to date, 채널 legacy/0 | `PASS` |
| T2 | R1 | `required` | main 승격과 Vercel 배포 대조 | `3e69c58`, 이어서 `9516f1d`로 올렸다. 두 번 모두 HTML의 `dpl_`가 그 커밋의 Vercel 상태 id와 같았다. `/` 200, `/api/mcp` 401 | `PASS` |
| T3 | R1 | `required` | status 실행(42026334065). 승인 대기 중에 profile secret을 처음 넣음 | 성공했다. 배포 job은 승인 뒤 43초 걸렸다. 승인 대기 중에 넣은 secret이 쓰였다 | `PASS` |
| T4 | R1, R2 | `required` | bootstrap 실행(42027310590) | 성공했다. 배포 job은 승인 뒤 60초 걸렸다. `{releaseId: fc20ccfd…, revision: 1, previousReleaseId: null}` | `PASS` |
| T5 | R2 | `required` | 읽기 전용 status, result, pin 조회 | versioned·revision 1·active `fc20ccfd…`·장벽 true다. result도 같다. 열린 PipelineRun 7/7과 PipelineWorkRun 1/1이 R0에 pin됐다. release 1개, entry 13개 | `PASS` |
| T6 | R3 | `required` | 번들 설치 | 캐시 2,238개 sha256이 전량 일치했다. template-guard hook이 있고, launcher의 runtime 검증을 통과했다 | `PASS` |
| T7 | R3 | `required` | 두 저장소 재init과 `project_sync` | 둘 다 ready(lock v2, R0)이고 sync가 성공했다. 아래 F3·F4 참고 | `PASS` |
| T8 | R3 | `required` | 새 headless Claude로 harness-smoke의 `project_get`과 `pipeline_next` 호출 | 둘 다 거부 없이 응답했고 `pipeline_next`의 templateRelease가 R0다. 비용 추정 $0.28 | `PASS` |
| T9 | R4 | `required` | gist와 secret 정리 | gist는 run이 끝나고 7초 뒤 지웠다(API 조회 gone). URL·evidence secret도 지웠다. 남은 secret은 `TEMPLATE_TARGET_PROFILES`뿐이고, WSL `gh`에 저장된 로그인은 없다 | `PASS` |

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 실제 결과 | 판정 |
| --- | --- | --- | --- | --- | --- |
| C1 | T1 | `required` | `node --env-file=<production env> node_modules/prisma/build/index.js migrate status` 전후 | 미적용 2개, 적용 뒤 up to date | `PASS` |
| C2 | T4 | `required` | 전환 직전 백업: WSL `pg_dump`와 임시 DB 복원 | 190KB, 복원 오류 0, 채널 legacy/0, Template 13. 기준 시각은 12:37:38Z | `PASS` |
| C3 | T2 | `required` | `npm run verify:plugin-version -- --base origin/main --head 9516f1d` | 출하 플러그인 변경 없음 | `PASS` |

## Findings and Follow-up

| ID | 심각도 | 발견 사항 | 추적 위치 | 재검증 조건 |
| --- | --- | --- | --- | --- |
| F1 | high | 첫 status 실행의 검증 job이 `codex/free/en`에서 실패했다. 비공개 릴리스 시험의 Codex init이 `~/.codex`의 검증 스킬에 기댔기 때문이다. 운영에는 닿지 않았다 | #292(고침) | 다음 template-release 실행의 검증 job |
| F2 | medium | `9516f1d`의 client-init-smoke update 2개가 실패했다. update는 `origin/main`을 이전 판으로 쓰는데, 이전 판이 0.6.1이 되면서 legacy로 시드한 시험 서버에서 첫 단계가 거부된다. 어느 커밋에서 돌려도 같다. 사용자가 예외를 승인했다 | 계획서 remaining follow-up | update 시나리오 수정 뒤 4 job 녹색 |
| F3 | medium | 옛 템플릿으로 init한 저장소는 0.6.1로 올릴 때 관리 블록 때문에 한 번 `--adopt`가 필요했다. lock v1에는 블록 hash가 없다 | 계획서 인수 중 관찰 | 업그레이드 안내 검토 |
| F4 | medium | 프로젝트 작업이 고친 관리 파일(harness-smoke `docs/plans/README.md`)이 있으면 설치가 pending으로 남는다. 사용자 결정으로 그 파일을 하네스 판으로 되돌렸다 | 계획서 인수 중 관찰 | 정책 검토 |
| F5 | low | versioned 모드에서는 `project_get`의 `runbookVersion`이 legacy 값으로 남는다 | 계획서 인수 중 관찰 | 필드 의미 정리 |

## Test Data and Cleanup

| 리소스 | 테스트 중 변경 | 정리 작업과 최종 상태 | 남은 영향 |
| --- | --- | --- | --- |
| 비밀 gist와 전환 secret | 생성 | 실행 직후 삭제 | 없음 |
| WSL 프로필과 secret 값 파일 | 생성 | 삭제 | 없음 |
| WSL snapshot, evidence, `pg_dump`, 비공개 템플릿 clone | 생성 | 0600으로 보관 중 | 며칠 뒤 삭제한다 |
| harness-smoke, mathgic 작업 트리 | 재init 파일 | 커밋하지 않고 남김 | 사용자가 커밋한다 |

- Sensitive-data review: 이 보고서에는 토큰, 연결 문자열, gist 주소, 비공개 템플릿 본문이 없다. ID와 hash 앞부분만 적었다.

## Conclusion

- Result rationale: 모든 required 항목이 `PASS`다. F1은 운영에 닿기 전 검증 job에서 막혔고 #292로 고쳤다. F2는 승인된 예외다.
- Remaining uncertainty: `agent_next`와 새 AgentRun pin은 첫 실제 실행에서 확인한다.
- Rerun decision: 불필요하다. F2를 고친 뒤 다음 승격의 client-init-smoke가 재검증이다.
