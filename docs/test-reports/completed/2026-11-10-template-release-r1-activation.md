---
status: "completed"
stage: null
result: "pass"
report-kind: "acceptance"
report-size: "compact"
test-levels: ["end-to-end", "manual"]
test-tools: ["GitHub Actions template-release.yml", "pg read-only queries", "Claude Code 2.1.319 headless", "harness 0.6.4 GitHub source install", "Chrome owner session"]
created-at: "2026-11-10"
completed-at: "2026-11-10"
last-executed-at: "2026-11-10T05:33:00Z"
tested-revision: "8b231c2208b8607852e33ef58f3022602e5c963f"
owners: ["user:Sangeok"]
related: ["docs/proposals/completed/2026-11-10-template-release-r1-activation.md", "docs/proposals/completed/2026-11-11-template-release-versioning.md", "docs/architecture/template-releases.md"]
primary-area: "harness/template-releases"
observed-environments: ["production | Neon PostgreSQL and Vercel production | GitHub Actions ubuntu-latest | single owner account", "local | macOS 26.2 | Claude Code 2.1.319 with harness 0.6.4 | owner"]
test-summary: "pass: production R1 activation and pointer recovery — the channel is at revision 4 with R1 active, new selection followed each pointer, and existing runs kept their pins"
follow-up: ["docs/proposals/active/template-release-acceptance-follow-ups.md"]
---

# 템플릿 R1 운영 활성화와 포인터 복구 인수

## Summary and Decision

운영 템플릿을 R1(비공개 템플릿 `8ccb37a`)으로 바꿨다. R0로 포인터를 복구했다가 다시 R1으로 돌리는 인수도 했다. 지금 채널은 versioned, revision 4, active R1이다. 원 제안서 TPL4의 후반과 VFY-TPL-09 production 부분(활성화, 이전 포인터 복구, 기존 실행 유지, 새 선택)이 끝났다. 절차와 단계별 기록은 [R1 활성화 계획](../../proposals/completed/2026-11-10-template-release-r1-activation.md)에 있다.

## Scope and Criteria

포함 범위:

- R0 안정 판정
- #16 머지와 R1 커밋 확정
- 운영 import, activate 세 번
- 시험 프로젝트 `stagekeeper-macos-e2e`의 R1 인수와 포인터 복구 인수

제외 범위:

- Codex 경로와 다른 기기
- Windows PC 저장소의 R1 재init
- private 전체 snapshot의 실제 복원

| 기준 ID | 기준 | 확인 기준 |
| --- | --- | --- |
| R1 | 계획서 A2 | 채널 정상, 열린 실행의 pin 누락 0, 전환 뒤 실제 실행이 R0에 pin |
| R2 | 계획서 B·C·D | R1 원본이 smoke로 검증한 tree와 같고, import·activate가 기대한 결과를 내며, 열린 R0 실행의 pin이 그대로다 |
| R3 | 계획서 E | R1 설치본이 ready이고, 새 실행과 그 AgentRun이 R1에 pin되며, `pipeline_next`·`agent_next`가 거부 없이 응답한다 |
| R4 | 계획서 F | 복구와 재활성화 뒤 새 선택이 그때의 active를 따르고, 기존 실행은 pin을 유지한다 |

## Test Target and Preconditions

- 운영 DB는 Neon 운영 브랜치다. 모든 워크플로 실행은 main `8b231c2`(플러그인 0.6.4)에서 돌았다.
- R0는 `fc20ccfd…`(legacy-snapshot, 13행)이다. R1은 `fc5e5f59…`(git `8ccb37a`, 13행)이다.
- 클라이언트는 이 Mac의 user scope `harness@stagekeeper-local` 0.6.4다(인수 전 0.5.33). 시험 저장소는 `stagekeeper-macos-e2e`다.
- 사전 조건(A2, 02:26Z):
  - 채널은 versioned, revision 1, active R0, 장벽 true였다. 배포 기록은 bootstrap 1건이었다.
  - 열린 PipelineRun 6, PipelineWorkRun 2, AgentRun 1이 모두 R0였다.
  - 전환 뒤 AgentRun 7개가 R0로 돌았고 6개가 끝났다. run-start 작업 실행 1개도 R0였다.
  - 운영 읽기는 모두 `BEGIN TRANSACTION READ ONLY`에서 했다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 실제 결과 | 판정 |
| --- | --- | --- | --- | --- | --- |
| T1 | R1 | `required` | 운영 집계(읽기 전용) | 위 사전 조건과 같다. pin 누락 0 | `PASS` |
| T2 | R2 | `required` | #16 merge commit과 tree 대조, main `8b231c2`에서 `test:template-release` | `8ccb37a`와 `a2538a5`의 tree가 `feebf885…`로 같다. 시험 3/3 pass | `PASS` |
| T3 | R2 | `required` | import(run 42745084319, `tpl4-r1-import-20261110-1`) | 성공했다. R1 `fc5e5f59…` sealed, entry 13. 채널은 revision 1, active R0 그대로다 | `PASS` |
| T4 | R2 | `required` | activate R1(run 42748697884, expected 1) | 성공했다. revision 2, active R1. 열린 R0 실행 수와 pin이 import 직후와 같다 | `PASS` |
| T5 | R3 | `required` | 0.6.4 설치와 시험 저장소 `--adopt` init | `ready: claude · release fc5e5f59…`, lock v2. 설치된 `CLAUDE.md`에 "Plan verification stop rule"이 있고 경로 5가 R1 문구다 | `PASS` |
| T6 | R3 | `required` | headless Claude의 work-assigner 한 턴 | `pipeline_next`가 R1 dispatch를 돌려줬다. 새 작업 실행, work-assigner AgentRun, 배정된 ITEM-02의 PipelineRun이 모두 R1, run-start다. 아래 F1 참고 | `PASS` |
| T7 | R4 | `required` | activate R0(run 42761804905, expected 2) | 성공했다. revision 3, active R0. T6의 R1 실행들은 R1 그대로다 | `PASS` |
| T8 | R4 | `required` | 복구 뒤 ITEM-04를 웹에서 보드에 올리고 R1 설치본으로 `pipeline_next` 호출 | ITEM-04의 새 실행은 R0, run-start다. `pipeline_next`는 ITEM-04에 `wait`·`template`과 R0 설치 요구를 돌려줬다. ITEM-02는 R1으로 `wait`·`gate`였다 | `PASS` |
| T9 | R4 | `required` | activate R1(run 42762380377, expected 3)과 ITEM-05 보드 올리기 | 성공했다. revision 4, active R1. ITEM-05의 새 실행은 R1, run-start다 | `PASS` |
| T10 | R2, R4 | `required` | 실제 프로젝트의 R0 실행 | R1이 active였던 03:21–05:25Z에 harness-smoke의 dev·impl-verifier AgentRun이 R0 계보로 돌고 끝났다. 끝날 때 열린 R0 실행은 7개다 | `PASS` |

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 실제 결과 | 판정 |
| --- | --- | --- | --- | --- | --- |
| C1 | T2 | `required` | `HARNESS_RELEASE_SOURCE=<8ccb37a checkout> HARNESS_RELEASE_COMMIT=8ccb37a… npm run test:template-release` | 3 pass, 0 fail | `PASS` |
| C2 | T3–T9 | `required` | 각 run의 검증 job | 네 번 모두 성공(약 1분). 배포 job은 승인 뒤 40–60초 | `PASS` |
| C3 | T3–T9 | `required` | 배포 기록 조회(읽기 전용) | bootstrap, import, activate 세 건이 요청 ID와 release가 일치한다 | `PASS` |

job summary는 API로 읽을 수 없다. 결과는 운영 DB 읽기로 대조했다(계획 D4의 대안).

## Findings and Follow-up

| ID | 심각도 | 발견 사항 | 추적 위치 | 재검증 조건 |
| --- | --- | --- | --- | --- |
| F1 | medium | work-assigner가 배정을 끝낸 뒤 메인 루프가 `agent_next`로 결과를 보고하자 stale로 거부됐다. 이어진 호출이 work-assigner 실행을 하나 더 열었고, 시험 프로젝트에 R1 작업 실행 1개와 AgentRun 1개가 열린 채 남았다. 템플릿 차이와는 무관해 보인다 | 이 보고서 | 배정 흐름의 receipt 계약을 별도로 확인 |
| F2 | low | `in_review`에서 폐기한 ITEM-02의 백로그 항목은 남아서 work-assigner가 다시 배정했다. `proposed`에서 폐기한 항목은 백로그에서도 빠졌다 | 이 보고서 | 폐기 범위의 의도 확인 |
| F3 | low | 저장소 루트의 `production.env`는 `.gitignore`의 `.env*`에 걸리지 않는다. 인수 중 사용자가 만든 운영 env 파일을 저장소 밖 `~/.stagekeeper/`(0700/0600)로 옮겼다 | 이 보고서 | 운영 env 파일 위치 안내 또는 ignore 규칙 검토 |
| F4 | low | Vercel의 운영 `DATABASE_URL`은 Sensitive라 `vercel env pull`로 받을 수 없다. 운영 읽기에는 사용자가 Neon에서 받은 값을 썼다 | 이 보고서 | 없음 |

계획과 달라진 점:

- 승격 때문에 main이 `62e68dd`에서 `8b231c2`로 바뀌었다. 그래서 E1은 0.6.2 대신 0.6.4를 설치했다.
- `backlog_add`는 agent 실행의 `runId`가 필요해 메인 루프가 쓸 수 없다. 그래서 시험 항목은 웹 백로그에서 추가했다.
- X1(ITEM-04)은 work-assigner가 probe라는 이유로 배정하지 않았다. 대신 남아 있던 ITEM-02가 배정됐다(F2).
- F2는 새 작업 실행 대신 웹의 Put on the board로 확인했다. F1의 열린 작업 실행을 `pipeline_next`가 이어 쓰기 때문이다. 보드 직접 올리기는 부모가 없어 active를 고른다.
- 보드의 열린 항목 한도(2개) 때문에 ITEM-05를 올리기 전에 ITEM-04를 폐기했다.

## Test Data and Cleanup

| 리소스 | 테스트 중 변경 | 정리 작업과 최종 상태 | 남은 영향 |
| --- | --- | --- | --- |
| 시험 프로젝트 보드 | ITEM-02(두 번), ITEM-03, ITEM-04, ITEM-05 | 모두 폐기. 백로그는 비어 있다 | R1 작업 실행 1개와 AgentRun 1개가 열려 있다(F1) |
| 시험 저장소 `stagekeeper-macos-e2e` | `verification-paths.md`를 하네스 판으로 되돌린 뒤 R1으로 재init | 커밋 `14daf46`(로컬, push 안 함) | 없음 |
| 이 Mac의 플러그인 | 0.5.33 → 0.6.4 | 유지 | 없음 |
| Vercel CLI | 설치와 로그인. `vercel link` 폴더와 받은 env 파일 | link 폴더와 env 파일 삭제 | CLI와 로그인은 남아 있다 |
| `~/.stagekeeper/production.env` | 사용자가 만들었고 저장소 밖으로 옮김 | 사용자 결정 대기 | 운영 접속 정보가 이 Mac에 있다 |

- Sensitive-data review: 이 보고서에는 토큰, 연결 문자열, 비공개 템플릿 본문이 없다. release ID는 앞 8자만 적었다.

## Conclusion

- Result rationale: 모든 required 항목이 `PASS`다. F1–F4는 템플릿 릴리스 동작과 무관하며 운영 상태를 바꾸지 않았다.
- Remaining uncertainty: Codex 경로와 Windows PC 저장소의 R1 재init은 확인하지 않았다.
- Rerun decision: 불필요하다.
