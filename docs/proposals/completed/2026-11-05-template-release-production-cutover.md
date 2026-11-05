---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-11-04"
approved-by: "user"
approved-at: "2026-11-05"
approval-scope: "Phase A–G: 운영 집계와 로컬 리허설, environment와 secret, 게이트, 운영 migrate deploy, main 승격(3e69c58, 수정 뒤 9516f1d), template-release.yml의 R0 bootstrap, 이 PC의 0.6.1 번들 설치와 재init. 운영 쓰기는 단계마다 실행 직전에 따로 승인받았다. Phase H(R1·포인터 복구)는 제외."
completed-at: "2026-11-05"
verification-summary: "운영 R0 전환 성공(run 42027310590, release fc20ccfd…, revision 1, 장벽 true, 열린 실행 8/8 pin). main 9516f1d와 Vercel 배포 일치, status 실행에서 승인 대기 중 secret 반영 확인. 이 PC 0.6.1 번들 캐시 전량 일치, 두 저장소 재init ready, 새 Claude에서 pipeline_next가 R0로 응답. E4 1차 실패(시험의 Codex 검증 스킬 의존)는 #292로 고쳤고, Y의 client-init-smoke update 2개 실패(이전 판 기준이 0.6.1로 바뀜)는 사용자가 예외로 승인했다. agent_next와 새 AgentRun pin은 첫 실제 실행에서 확인한다."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/active/template-release-versioning.md"
  - "docs/architecture/template-releases.md"
  - "docs/architecture/verification.md"
  - "AGENTS.md"
---

# 템플릿 릴리스 운영 전환(TPL4 R0)과 0.6.1 승격

## Summary

dev의 #287을 운영에 내보내려면 운영 DB의 템플릿 채널을 `legacy`에서 `versioned`로 바꿔야 한다. 그래야 플러그인 0.6.1이 동작한다. 이 문서는 [template-release-versioning.md](../active/template-release-versioning.md)의 Phase TPL4 가운데 R0 전환까지를 운영에서 실행하는 절차를 정한다. 범위는 사전 확인, 운영 데이터 사본으로 하는 로컬 리허설과 백업 확인, 승격 게이트, 운영 마이그레이션과 main 승격, 유지보수 시간의 snapshot·bootstrap, 이 PC의 클라이언트 전환이다. R1 활성화와 포인터 복구 인수는 R0가 안정된 뒤 별도 승인으로 한다.

## Goal

- 운영 서버와 DB를 같은 코드 SHA에서 versioned R0로 전환하고 0.6.1을 출시한다.
- 승격 뒤 전환 전에는 0.6.1이 거부되고, 전환 뒤에는 0.5.33이 거부된다. 이 두 구간을 같은 날 한 번의 짧은 구간으로 줄이고, 운영 쓰기를 멈추는 시간을 최소로 한다.
- 전환이 실패하면 운영 데이터는 바뀌지 않는다. 성공 뒤 문제가 생기면 되돌아갈 길이 두 가지 있다. 이력 보관 기간 안에는 운영 브랜치를 전환 직전 시각으로 되돌리고, 그 뒤에는 전환 직전에 받은 `pg_dump` 파일로 복원한다.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 운영 DB 마이그레이션, 운영 데이터 전환(채널 mode·실행 pin·receipt revision), 서비스 배포가 함께 있다.
- 채널 mode를 legacy로 되돌리는 복구는 지원하지 않는다(`docs/architecture/template-releases.md:93`). 롤백이 단순 revert 이상이다.

## Current State

2026-11-04~05에 확인한 상태다.

브랜치와 게이트:

- 브랜치는 main `7d5c893`(플러그인 0.5.33)과 dev `3e69c58`(0.6.1, #287·#288·#289·#290)이다. #287 시점의 판은 0.6.0이었고 #290이 0.6.1로 올렸다(`verify:plugin-version`: 0.5.33 → 0.6.1, 출하 파일 26개).
- 승격 게이트는 `339e59a`에서 모두 녹색이었다. check 41789138018, windows-role-runtime 41789137975, macos-runtime-contracts 41789138106, client-init-smoke 41789393940, agent-eval 41789397814, pipeline-smoke 41789402218이다.
- `3e69c58`의 push CI도 녹색이다. check 41795036844, windows-role-runtime 41795036371, macos-runtime-contracts 41795036372다. 유료 게이트는 승격할 커밋에서 다시 돌린다.
- 운영 DB의 미적용 마이그레이션은 `20261103120000_template_release_versioning`과 `20261103130000_template_execution_guard` 두 개다. 둘 다 추가형이고, 적용하면 `default` 채널이 legacy로 생긴다.

서버·플러그인 조합은 원 제안서 출시 조합 표(`template-release-versioning.md:444`, `:445`, `:449`)와 같다. 현재 코드로도 확인했다.

| 운영 상태 | 0.5.33 | 0.6.1 |
| --- | --- | --- |
| legacy (승격 뒤 전환 전) | 정상 | 템플릿 GET 400 `Template release protocol is not active`(`src/server/rest/templates-handler.ts:59`). MCP 진행도 같은 사유로 거부(`src/server/mcp/deps.ts:65`, `src/server/agents/run-service.ts:35`) |
| versioned (전환 뒤) | 템플릿 GET 400 `Template release protocol required; update the plugin`(`templates-handler.ts:50`). `pipeline_next` 거부 `Template installation metadata required; update the plugin and run init`(`deps.ts:64`) | 정상 |

- 활성화 뒤에는 구 서버와 신 서버가 공존할 수 없다(`template-release-versioning.md:449`).

운영 쓰기의 경계와 워크플로:

- production 대상 import·activate·bootstrap은 `template-release.yml`의 GitHub Actions 실행 안에서만 통과한다(`scripts/templates/template-target.ts:63`).
- 워크플로는 dev 또는 main ref에서만 돌고, 그 SHA에 성공한 `check` push 실행이 있어야 한다(`.github/workflows/template-release.yml:54`, `:56`).
- 검증 job에는 운영 DB credential이 없다(`template-release.yml:38`–`:83`, `docs/architecture/template-releases.md:98`–`:99`). 배포 job은 environment 승인을 기다리고(`:89`), 승인 뒤 `npm ci`부터 다시 한다(`:106`).
- 이 워크플로는 아직 main에 없다. `gh run list --workflow template-release.yml`이 기본 브랜치에 없다는 404를 돌려주므로, main 승격 전에는 dispatch할 수 없다. 한 번도 실행되지 않아 두 job의 소요 시간은 잰 적이 없다.

필요한 설정이 아직 없다.

- GitHub environment는 Vercel이 만든 `Production`·`Preview`뿐이다. 워크플로가 쓰는 `template-production`(`template-release.yml:89`)은 없다.
- secret `TEMPLATE_TARGET_PROFILES`·`TEMPLATE_CUTOVER_EVIDENCE`·`TEMPLATE_CUTOVER_SNAPSHOT_URL`도 없다. 이 워크플로가 쓰는 secret 가운데 저장소에 있는 것은 `E2E_TEMPLATES_TOKEN`뿐이다.

R0가 될 운영 템플릿:

- 운영 Template 행은 2026-10-28에 비공개 템플릿 저장소 `fb6ef955ba3f6fc8320e173fbafc9ef03b83281b`로 시드했고 13행이 일치했다(운영 기록).
- 그 저장소의 기본 브랜치 끝도 같은 커밋이다(2026-11-05). client-init-smoke는 이 커밋을 고정하고(`.github/workflows/client-init-smoke.yml:130`), pipeline-smoke는 기본 브랜치를 쓴다(`.github/workflows/pipeline-smoke.yml:65`). 운영과 CI의 템플릿이 같다.
- 이 커밋은 `test:template-release`를 통과한다. 구현 보고서에 기록이 있고(`docs/test-reports/completed/2026-11-04-template-release-implementation.md:56`, `:98`), `3e69c58`에서 Windows 로컬로 다시 돌려 2개가 통과했다.

snapshot 작성:

- `bootstrap-template-releases --snapshot`은 읽기 전용이라 production에도 workflow 밖에서 실행할 수 있다. 워크플로에는 snapshot 작업이 없다.
- 프로필·snapshot·evidence 파일은 checkout 밖에 있어야 하고 mode 0600인지 검사한다(`template-target.ts:23`, `scripts/templates/bootstrap-template-releases.ts:17`).
- 이 PC의 Windows Node는 chmod 600 뒤에도 mode를 666으로 보고해 이 검사를 통과할 수 없다(실측). WSL Ubuntu 26.04.1에는 Node 22.13.1이 있고, 그 안에서 만든 0600 파일은 mode 600으로 보고된다(A4).

bootstrap의 성질(`src/server/templates/bootstrap-service.ts`):

- 템플릿·실행 계보 표 12개를 잠근다(`:76`). 같은 transaction에서 다시 찍은 snapshot hash가 승인한 evidence의 hash와 다르면 거부한다(`:79`).
- snapshot 대상은 Template 전체와 모든 프로젝트의 실행 계보·단계·보고·전환 기록이다. 따라서 snapshot부터 bootstrap까지 운영 전체에 쓰기가 없어야 한다.
- 채널이 손대지 않은 legacy가 아니면 거부한다(`:80`).
- 성공하면 R0 seal, 열린 실행 pin, 열린 AgentRun revision 1 증가, legacy writer 장벽, versioned 채널을 한 transaction으로 저장한다(`:145`).
- transaction 설정은 Serializable, maxWait 15초, timeout 30초다(`src/server/templates/release-service.ts:17`). 거부·실패는 전부 rollback되고, 요청 결과는 성공했을 때만 기록된다.
- bootstrap 통합 시험(`tests/server/integration/template-bootstrap.test.ts`)은 CI의 check에서 돈다(`.github/workflows/check.yml:82`).

이 PC의 클라이언트:

- `harness@stagekeeper-windows` 0.5.33(로컬 마켓플레이스 번들)과 Claude Code 2.1.318을 쓴다. native hook 조건인 2.1.295 이상은 충족한다.
- 0.6.1 번들은 템플릿 hook을 `node` 대신 `powershell.exe … harness.ps1 template-guard`로 바꿔 넣는다(`scripts/windows/package-windows-plugin.mjs:44`–`:45`). 이 hook은 실패하면 호출을 막고 제한 시간은 15초다(`plugin/hooks/hooks.json`). main 대비 번들 쪽 변경은 이 hook 교체와 `plugin/bin/harness.ps1`의 template-guard 분기뿐이다.
- 저장소의 시험과 CI는 이 경로를 실행하지 않고, smoke 리허설 도구는 번들 설치를 지원하지 않는다(`scripts/rehearsals/rehearse-client-init-smoke.ts:81`). 구현 보고서는 Windows bundle을 출시 전 확인 항목으로 적었다(`2026-11-04-template-release-implementation.md:130`).
- CI의 pipeline-smoke는 windows-2022에서 GitHub 소스 설치로 0.6.1을 확인한다(`pipeline-smoke.yml:23`, `:89`). 그 실행의 Node는 22.23.4였다. 번들 내장 Node는 22.23.3이고(`scripts/windows/build-windows-role-node.ps1:6`), 이 PC의 PATH Node는 22.13.1이다.

Neon:

- 운영과 dev는 같은 Neon 프로젝트(미국 동부 리전)의 브랜치다. dev는 2026-11-01에 운영 브랜치에서 만든 하위 브랜치다.
- 이 PC는 한국에 있어서 운영 DB까지 왕복이 길다. 운영 snapshot(F3)은 이 PC의 WSL에서 만들고, 운영 bootstrap은 GitHub 러너에서 실행된다.
- 시점 복원(instant restore)은 root 브랜치에서만 된다. 하위 브랜치는 지원하지 않고, 복원 원본도 root 브랜치여야 한다([branch restore](https://neon.com/docs/guides/branch-restore)). 운영 브랜치는 root다.
- 하위 브랜치가 있는 브랜치를 복원하면 복원 전 상태가 백업 브랜치로 남고, 하위 브랜치는 모두 그 백업 아래로 옮겨진다. 복원해도 연결 주소는 바뀌지 않고, 몇 초 걸린다.
- 이력 보관 기간은 Free 6시간(최대 6시간), Launch 기본 1일(최대 7일), Scale 기본 1일(최대 30일)이다([history window](https://neon.com/docs/introduction/history-window)). 이 프로젝트는 Free 플랜이라 6시간이다(2026-11-05 사용자 확인).
- Free 플랜은 청구가 없다. 대신 프로젝트의 compute 한도(월 100 CU-hours, 모든 브랜치 합산)나 전송량 한도(월 5GB)를 넘으면 운영을 포함한 compute가 다음 결제 주기까지 멈춘다. 브랜치는 10개, 저장 공간은 1GB까지다. 5분 동안 활동이 없어 멈춘 compute는 CU-hours를 쓰지 않는다([plans](https://neon.com/docs/introduction/plans)).

## Scope

포함 범위:

- 사전 확인: push CI, 운영 DB 읽기 전용 집계, 템플릿 대조, WSL 준비, Windows 번들 launcher 비교
- GitHub environment·secret 준비. secret 값은 사용자가 넣는다.
- 운영 데이터 사본으로 하는 WSL 로컬 리허설과 백업 사본 확인
- 승격 커밋 확정, 승격 게이트 재실행, 0.6.1 번들 패키징
- 운영 `migrate deploy`, main 승격, 배포와 `status` 확인
- 유지보수 시간의 snapshot·evidence·bootstrap
- 이 PC의 0.6.1 번들 설치, 재init, 인수 확인
- 기록: 이 문서, 원 제안서 진행 기록, 인수 보고서

제외 범위:

- R1 import·활성화·포인터 복구 인수(TPL4 후반). R0가 안정된 뒤 별도로 승인받는다.
- Codex 경로의 운영 인수. dual-client 문서의 범위이고, CI smoke는 Claude만 확인한다.
- 템플릿 본문과 서버·도구 코드 변경. 도구 결함을 찾으면 멈추고 별도 PR로 고친 뒤 Phase A부터 다시 한다.
- Windows 번들 hook의 호출당 비용 개선
- Neon compute 사용량 줄이기. 실행기·watch의 60초 신호가 운영 compute를 깨워 둔다(2026-11-05 측정). 이 작업이 끝나면 바로 이어서 한다(사용자 요청).
- 오래된 묶음의 정리, 보존 기간, 캐시

## Proposal

### 결정 필요

| ID | 결정 | 선택지 | 권장 |
| --- | --- | --- | --- |
| D1 | snapshot 전달과 보관 | 워크플로는 인증 헤더 없이 HTTPS URL 하나를 `curl`로 받는다(`template-release.yml:129`). snapshot에는 비공개 템플릿 본문과 운영 실행 기록이 들어간다. (a) 만료가 짧은 서명 URL(S3·R2 등) (b) 비밀 gist에 올리고 실행 직후 삭제 (c) 암호화 파일을 받도록 워크플로 수정(코드 변경) | (b). 계정 준비 없이 바로 쓸 수 있고 snapshot이 작다(A2). 주소는 출력하지 않고 secret에 바로 넣으며, 배포 job이 끝나면 바로 지운다. 지운 뒤에도 캐시로 최대 5분은 열린다(B3). C3의 snapshot 크기로 한도를 다시 확인한다. 장기 보관본은 OneDrive 밖에 둔다. |
| D2 | snapshot 실행 환경 | WSL Ubuntu(Node 22.13.1 설치돼 있음)에 저장소 clone / 다른 POSIX 기기 | WSL. A4에서 준비를 마쳤다. |
| D3 | 유지보수 시간과 공지 | A2의 최근 활동 사용자 수를 보고 정한다 | A2 결과 사용자는 본인 1명이다. 공지 없이 한 시간을 잡는다. |
| D4 | 리허설 깊이 | (a) 운영 데이터 사본에서 bootstrap과 백업 사본 확인 (b) 로컬 서버를 사본에 붙여 0.6.1 init과 열린 실행 재개까지 | (a). 백업 확인은 원 제안서 BLK-TPL-03(`template-release-versioning.md:510`, `:512`) 때문에 필수다. 사본은 Neon 브랜치 대신 WSL 로컬 PostgreSQL에 둔다. (b)는 하지 않는다. 템플릿은 CI와 같고, 번들 차이는 A5로 확인하며, 번들이 실패해도 G4의 소스 설치로 대신한다. |
| D5 | 복구 기준점 | 전환 직전 Neon 운영 브랜치 생성 / PITR 시각만 기록 | 둘 다. 시점 복원은 root인 운영 브랜치의 자기 이력에서만 되므로 전환 직전 시각을 기록한다. 이력 보관 기간이 지난 뒤를 위해 백업 브랜치도 만든다. |

2026-11-05 사용자 결정: D1 (b) 비밀 gist, D2 WSL, D3 게이트가 끝난 직후 같은 날·공지 없음, D4 (a), D5 시각 기록과 백업 브랜치 둘 다. 리허설 사본은 Neon 브랜치 대신 WSL 로컬 PostgreSQL에 둔다.

2026-11-05 사용자 지시: WSL에서 만든 파일(프로필, secret 값, snapshot, evidence)은 쓰는 일과 지우는 일까지 WSL 안에서 끝낸다.

- gist와 secret 작업(E4, F5, F6, F9)은 WSL에 설치한 `gh`로 한다.
- 토큰은 Windows `gh`의 것을 그 명령의 환경 변수로만 넘기고 WSL에 저장하지 않는다.
- 파일 내용은 Windows 쪽 프로세스나 디스크를 거치지 않는다.

2026-11-05 사용자 결정: D5의 백업은 Neon 백업 브랜치 대신 WSL에서 받는 `pg_dump` 파일로 한다. 전환 직전 시각 기록은 그대로 한다.

### Phase A — 사전 확인 (운영 쓰기 없음. A3의 시드만 예외)

1. dev 끝의 push CI 3종이 녹색인지 본다.
2. 운영 DB를 집계한다. 수동 모드에서 사용자 승인을 받아 실행하고, 결과는 집계만 출력한다.
   - `migrate status`
   - snapshot 대상 12개 표의 행 수. bootstrap timeout 30초 안에 끝날지 판단하는 근거다.
   - 열린 PipelineRun·PipelineWorkRun·AgentRun 수, 부모 없이 열린 AgentRun의 agent별 수, AgentRun revision 최댓값
   - Template 행 수와 행별 LF 정규화 sha256 앞 12자. fb6ef955와 대조한다.
   - 최근 7일 동안 MCP 활동이 있었던 사용자 수
3. 운영 템플릿이 fb6ef955와 다르면 멈추고 어느 커밋과 같은지 먼저 확인한다.
   - 그 결과에 따라 fb6ef955로 시드하거나, 그 커밋으로 게이트를 다시 돌린다. client-init-smoke의 `template_commit`, pipeline-smoke의 `templates-ref` 입력을 쓴다.
   - 시드는 운영 쓰기라 실행 직전에 승인받고, C1의 복사본을 만들기 전에 한다. `--snapshot`은 저장소와 OneDrive 밖에 둔다.
   - 워크플로의 `source_commit`은 R0와 같은 커밋이다. 대조가 일치하면 fb6ef955다.
4. WSL을 준비한다. 공개 저장소를 WSL 파일 시스템에 clone하고 `npm ci`와 `npm run db:generate`를 실행한다.
5. Windows 번들 launcher를 비교한다.
   - dev 끝의 windows-role-runtime artifact를 `scripts/windows/windows-role-runtime-cache.mjs verify`로 검증하고, 번들을 저장소와 마켓플레이스 밖 새 폴더에 패키징한다.
   - 단위 시험(`plugin/runtime/template-installation.test.mjs`)의 fixture와 가짜 서버로 같은 hook 입력을 번들 launcher와 `node` 직접 실행에 넣는다. 입력에는 한글·따옴표·역슬래시를 넣는다.
   - 허용·거부 출력이 같은지, 종료 코드, 걸린 시간을 hook 제한 15초와 비교한다. 비교 스크립트는 저장소 밖에 둔다.
6. Vercel의 이전 production 배포 URL이 보호되는지 확인한다. 보호되지 않으면 옛 서버가 legacy reader로 남는다.
7. 사용자가 다른 세션과 겹치지 않는지 확인한다. 이 문서 밖에서 TPL4, main 승격, 운영 템플릿 시드를 하지 않는다.

중단 조건: 미적용 마이그레이션이 위 두 개와 다름, 귀속을 판단할 수 없는 열린 역할, revision 상한에 가까운 행, A5의 출력 불일치나 제한 시간 초과

### Phase B — 준비 (운영 데이터 쓰기 없음)

1. GitHub environment `template-production`을 만든다. 사용자 승인을 받아 `gh`로 만들고, 설정을 다시 조회해 확인한다. 필수 검토자는 사용자 본인, 배포 브랜치는 `main`만이다. 필수 검토자가 없으면 F1의 순서가 성립하지 않는다.
2. 프로필 생성 스크립트 하나로 WSL 프로필 파일과 secret 값을 같은 내용으로 만든다.
   - WSL 파일: `~/.stagekeeper/template-targets.json`(0600)에 production 항목과 리허설용 로컬 DB(staging) 항목을 둔다. 리허설 뒤에는 production 항목만 남긴다.
   - secret 값: production 항목만 담은 0600 파일을 OneDrive 밖에 둔다. 입력은 E4에서 한다.
   - 형식은 `{"production": {connectionString, hostname, port, database, schema: "public", routing}}`이다. pooler가 아닌 direct host를 쓴다. 두 곳의 hostname·port·database·schema·routing이 같아야 snapshot의 target identity가 일치한다.
   - 값은 대화와 저장소에 남기지 않는다.
3. D1의 전달 경로를 시험 파일로 미리 확인한다.
   - 실제 snapshot보다 큰 더미 JSON을 올린다. 워크플로와 같은 `curl` 옵션으로 받아 hash가 같은지 보고 지운다.
   - 전달 주소는 출력하지 않고 secret에 바로 넣는다. 주소만 있으면 누구나 받을 수 있기 때문이다.

### Phase C — 로컬 리허설 (운영 데이터 사본)

리허설은 WSL checkout의 커밋(리허설 커밋)과 WSL 안의 PostgreSQL 18로 한다. Neon 브랜치는 쓰지 않는다. 2026-11-05에 복사본을 바로 만들 수 없어서 사용자가 이렇게 정했다. 보조 스크립트는 저장소 밖에 두고 집계만 출력한다.

1. WSL PostgreSQL에 리허설 전용 역할과 빈 DB `tpl4_rehearsal`을 만든다. 접속 정보는 `~/.stagekeeper`의 0600 파일에 둔다.
2. 운영 데이터를 받아 마이그레이션까지 맞춘다. 운영을 읽는 단계라 실행 직전에 승인받는다.
   - 전환 도구의 접속 코드(`withTemplateTarget`)로 운영에 한 번 연결해 F3과 같은 접속 경로를 확인한다.
   - `pg_dump`로 운영을 받아 로컬 DB에 넣는다. WSL의 libpq에는 인증서 검증용 root 파일이 없어서 `sslrootcert=system`을 붙인다.
   - 로컬 DB에 `migrate deploy`를 하고, 전환 전 상태를 `tpl4_rehearsal_pre`로 복사한다. 운영 백업 브랜치(F7)의 대역이다.
3. WSL 프로필에 로컬 DB를 staging으로 더하고 `bootstrap-template-releases --snapshot`으로 snapshot을 만든다. 크기를 D1 경로의 한도와 대조한다.
4. snapshot에서 evidence를 기계적으로 만든다. F4에서 같은 스크립트를 쓴다.
   - inventory는 모든 Template 행이고 excluded는 빈 목록이다.
   - readers는 `[{identity: "rehearsal-local", codeSha: <리허설 커밋>, protocol: "template-release-v1"}]`이다.
   - 부모 없이 열린 역할이 있으면 스크립트가 멈추고 처분은 사람이 정한다. 목표는 0개다.
5. bootstrap을 실행하고 걸린 시간을 잰다. 기대 결과는 `{releaseId, previousReleaseId: null, revision: 1}`이다.
   - 인자: `--environment staging --snapshot-file … --evidence-file … --request-id tpl4-rehearsal-1 --actor <사용자> --code-sha <리허설 커밋> --workflow-run local-rehearsal`
6. 결과를 확인한다.
   - `activate-templates --status true`가 versioned, active R0, writer 장벽 true를 보여야 한다.
   - 같은 요청 ID로 다시 실행하면 같은 결과가 나오고 revision은 그대로여야 한다. `--result` 조회도 같아야 한다.
   - 열린 PipelineRun·PipelineWorkRun·AgentRun이 모두 pin돼야 한다.
7. 백업 사본 `tpl4_rehearsal_pre`의 채널 상태가 legacy·revision 0·장벽 false인지 본다.
   - 전환 전 상태를 담은 백업이 쓸 수 있는 상태인지 보는 대역이다.
   - Neon 백업 브랜치와 운영 브랜치의 시점 복원은 Neon 문서의 동작을 따른다.
8. 로컬 DB와 역할, 받은 운영 사본, snapshot, evidence를 지운다. 프로필에는 production 항목만 남긴다.

중단 조건:

- 거부 사유가 나오면 원인을 고치고 C1부터 다시 한다.
- C5가 15초를 넘으면 운영 실행 전에 다시 판단한다. timeout은 30초다.
- 백업 사본 확인이 실패하면 운영 쓰기 전에 멈춘다(BLK-TPL-03).
- 도구 결함이면 별도 PR로 고친다.

### Phase D — 승격 커밋과 게이트

1. 승격 커밋 X를 정한다. 실행하는 날 dev 끝을 X로 정하고, AGENTS.md의 승격 게이트를 X에서 모두 녹색으로 만든다.
   - 게이트: `verify:plugin-version`, push CI 3종, client-init-smoke, agent-eval, pipeline-smoke
   - pipeline-smoke는 agent-eval이 끝난 뒤 dispatch한다. 같은 구독을 쓰기 때문이다.
   - dispatch는 `--ref dev`라서 도중에 dev가 움직이면 게이트마다 다른 커밋을 가리킨다. 모든 요약이 같은 X를 가리킬 때까지 다시 돌린다.
   - 게이트가 끝난 뒤 dev가 움직여도 X만 승격한다.
2. 리허설 커밋과 X 사이에 바뀐 경로를 본다.
   - `src/server/templates`, `scripts/templates`, `prisma/migrations`, `packages/core/templates`가 바뀌었으면 Phase C를 다시 한다.
   - `plugin/`이나 `scripts/windows/`가 바뀌었으면 A5를 X로 다시 한다.
3. X의 windows-role-runtime artifact를 검증하고 X 번들을 저장소와 마켓플레이스 밖 새 폴더에 패키징한다. artifact는 7일 동안만 보관된다.

### Phase E — 운영 마이그레이션과 main 승격

1. 운영 DB에 `migrate deploy`를 실행한다. 사용자 승인을 받고 수동 모드나 `!`로 한다.
2. `! git push origin <X>:refs/heads/main`
3. stagekeeper.dev HTML의 `dpl_` id가 X의 Vercel 상태 target_url id와 같은지 확인한다.
4. 워크플로로 `status`를 확인하면서 secret 반영 시점을 시험한다.
   - 명령: `gh workflow run template-release.yml --ref main -f operation=status -f environment=production -f source_commit=<R0 커밋> -f request_id=tpl4-status-1`
   - 배포 job이 승인 대기에 들어간 뒤 WSL의 `gh`로 `TEMPLATE_TARGET_PROFILES`를 처음 넣고, (사용자) 승인한다.
   - 성공하면 승인 대기 중에 넣은 secret이 쓰인다는 뜻이다. summary가 `{mode: "legacy", revision: 0, activeReleaseId: null, legacyWritesBlocked: false}`인지 보고, 두 job의 소요 시간을 기록한다.
   - 실패하면 secret을 넣은 채 다시 실행한다. F는 secret을 모두 넣은 뒤 실행하는 순서로 바꾼다.

E2부터 F8까지는 0.6.1 설치본의 init과 진행이 거부된다. 이 PC는 0.5.33을 유지한다. E2와 F는 같은 날 이어서 한다.

### Phase F — 유지보수 시간 (R0 전환)

1. bootstrap 워크플로를 실행한다. 검증 job은 운영에 닿지 않고 배포 job은 승인까지 기다리므로, 쓰기를 멈추기 전에 실행해도 된다.
   - 명령: `gh workflow run template-release.yml --ref main -f operation=bootstrap -f environment=production -f source_commit=<R0 커밋> -f request_id=tpl4-production-<날짜>-1`
2. writer를 정리한다.
   - 모든 기기의 상주 실행기, watch, Codex 세션을 멈추고 웹 화면도 열지 않는다. 공지는 D3에 따른다.
   - 열린 역할은 끝내거나 C4 방식으로 처분한다.
3. WSL에서 production snapshot을 만든다.
4. evidence를 작성하고 사용자가 검토·승인한다(BLK-TPL-04).
   - codeSha: X
   - readers: `[{identity: "vercel-production:<dpl id>", codeSha: X, protocol: "template-release-v1"}]`
   - maintenanceReference, writersDrained: true
   - inventory, excluded, unboundRuns
5. WSL에서 snapshot을 D1 방식으로 올리고, `template-production`에 secret `TEMPLATE_CUTOVER_EVIDENCE`와 `TEMPLATE_CUTOVER_SNAPSHOT_URL`을 넣는다. 주소는 출력하지 않는다.
6. WSL에서 URL로 받은 파일이 로컬 snapshot과 같은지 hash로 확인한다.
7. 전환 직전 시각을 UTC로 기록하고, WSL에서 운영을 `pg_dump`로 받아 `~/.stagekeeper/pre-tpl4-<날짜>.pgc`(0600)로 둔다(D5).
   - C2와 같은 방법(`sslrootcert=system`)을 쓰는 읽기 전용 작업이다.
   - 받은 파일을 WSL PostgreSQL의 임시 DB에 복원해 본다. 복원 오류가 없는지, 채널이 legacy·revision 0·장벽 false인지 보고, 그 DB를 지운다. BLK-TPL-03의 백업 확인이다.
   - writer가 멈춘 상태라 F3 snapshot과 같은 상태를 담는다.
8. (사용자) 배포 job을 승인한다. summary가 `{releaseId, previousReleaseId: null, revision: 1}`인지 본다.
9. 배포 job이 끝나면 바로 WSL에서 gist와 `TEMPLATE_CUTOVER_SNAPSHOT_URL` secret을 지운다. 지운 뒤에도 최대 5분은 캐시로 받을 수 있다(B3 실측). snapshot과 evidence 파일은 WSL `~/.stagekeeper`에 0600으로 남겨 두었다가 G7에서 정리한다.
10. 결과를 확인한다.
   - `status`가 versioned, active R0, revision 1, writer 장벽 true를 보여야 한다.
   - `result-bootstrap`을 같은 요청 ID로 조회하면 같은 결과가 나와야 한다.

중단 조건:

- `Snapshot drift`: 쓰기 원인을 찾은 뒤 새 요청 ID로 F1부터 다시 한다.
- `Cutover requires the untouched legacy channel`: 누가 채널을 바꿨는지 확인하기 전에는 진행하지 않는다.
- 실행 결과를 잃음: 같은 요청 ID로 `result-bootstrap`부터 조회한다(`template-releases.md:91`–`:92`).
- 그 밖의 실패: rollback으로 운영이 바뀌지 않았는지 `status`로 확인한 뒤 원인을 처리한다.

### Phase G — 클라이언트 전환과 인수

1. 이 PC에 D3의 X 번들을 설치한다.
   - 마켓플레이스의 `harness/`를 교체하고 marketplace update와 plugin update를 실행한 뒤 Claude Code를 재시작한다.
   - 설치 캐시의 sha256을 전량 대조한다. 옛 번들은 백업으로 둔다.
   - 새 경로의 첫 hook 호출은 5초 남짓 걸릴 수 있다(A5 실측).
2. 연결된 저장소마다 `/harness:init`을 실행하고 lock v2가 ready인지 확인한다.
3. `pipeline_next`와 `agent_next`가 정상인지 확인한다. 열린 실행은 옛 receipt가 stale이 되고 새로 읽어 재개해야 한다. 새 실행은 R0에 pin돼야 한다.
4. 번들 hook이 실패하면 GitHub 소스 설치로 바꿔 계속 쓴다.
   - CI의 pipeline-smoke가 windows-2022에서 같은 형태로 0.6.1을 확인한다.
   - PATH Node가 CI보다 낮으면(이 PC 22.13.1, CI 22.23.4) 최신 22로 올린다.
   - 번들은 별도 PR로 고친다.
5. 다른 기기가 있으면 0.5.33이 업데이트 안내로 거부되는지 확인한다.
6. 기록을 남긴다.
   - 이 문서의 Verification Results와 인수 보고서(`docs/test-reports/`, 허용 목록 요약만)
   - 원 제안서 Implementation Progress에 R0 전환 사실
   - 운영 템플릿 갱신은 이제 import와 activate로만 한다는 안내. legacy 시드는 writer 장벽이 거부한다.
7. WSL을 정리한다. 모두 WSL 안에서 한다.
   - 인수가 끝나면 프로필과 secret 값 파일을 지운다. Phase H에서 다시 필요하면 B2 스크립트로 만든다. `TEMPLATE_TARGET_PROFILES` secret은 Phase H의 워크플로가 쓰므로 남긴다.
   - `TEMPLATE_CUTOVER_EVIDENCE` secret을 지운다.
   - snapshot, evidence, F7의 `pg_dump` 파일, 비공개 템플릿 clone(`/root/tpl4-private-templates`, E4 재현용)은 인수가 끝나고 며칠 뒤 함께 지운다.
   - WSL의 `gh`에는 토큰을 저장하지 않았는지 확인한다.

### Phase H — 별도 승인 (이번 범위 밖)

R1을 import(비공개 Git 커밋)하고 activate(CAS)한 뒤, R0로 포인터를 복구했다가 다시 R1로 돌린다. TPL4 종료 조건과 VFY-TPL-09의 production 부분을 채운다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| GitHub environment `template-production`과 secret 3개 | 생성(사용자) | deploy job이 요구한다(`template-release.yml:89`, `:118`–`:120`) | medium — 운영 credential 보관 |
| 운영 DB schema | 마이그레이션 2개 적용 | 추가형 | low |
| 운영 DB 데이터 | R0 release·entry, versioned 채널, 열린 실행 pin, 열린 AgentRun revision 증가, legacy 장벽, TemplateDeployment | bootstrap | high — mode를 되돌릴 수 없음 |
| 운영 Template 행 | A3에서 다를 때만 시드 | R0를 CI가 검증한 묶음으로 맞춘다 | medium — 시드 전 행은 `--snapshot` 파일에 남는다 |
| `main`, Vercel production | X로 fast-forward, 배포 | 승격 | medium |
| WSL 로컬 PostgreSQL과 `~/.stagekeeper` | 리허설 DB와 역할, 받은 운영 사본(리허설 뒤 삭제), 운영 snapshot·evidence·F7 `pg_dump` 파일(며칠 뒤 삭제), 프로필과 secret 값 파일(G7에서 삭제) | 리허설, 전환, 복구 | low — 0600, OneDrive 밖 |
| WSL `gh` | 설치. 토큰은 저장하지 않는다 | gist·secret 작업을 WSL 안에서 끝낸다 | low |
| 이 PC의 플러그인과 연결 저장소 init 파일 | 0.6.1 설치, lock v2 | 클라이언트 전환 | low — 옛 번들을 백업 |
| `docs/proposals/active/template-release-production-cutover.md` | 신규 | 이 문서 | none |
| `docs/proposals/active/template-release-versioning.md`, `docs/test-reports/` | 실행 뒤 갱신 | 기록 | none |

## Safety Analysis

순서의 근거:

- 리허설을 게이트보다 먼저 한다. 리허설에서 도구 결함이 나오면 PR이 dev를 움직여 유료 게이트를 다시 돌려야 하기 때문이다.
- 서버를 먼저 올린다.
  - evidence의 readers codeSha는 워크플로가 실행하는 SHA와 같아야 한다.
  - 그 SHA가 운영에 배포돼 있어야 reader 증거가 사실이 된다.
  - 구 서버와 versioned DB는 함께 쓸 수 없다.
- 그다음 bootstrap, 마지막으로 클라이언트다. 원 제안서 §7의 1~6단계와 같은 순서다.
- 운영 쓰기를 멈추는 구간은 F2부터 F8까지다. 워크플로를 먼저 실행해 검증 job을 이 구간 밖으로 뺀다. 승인 뒤에도 배포 job의 설치 시간만큼은 멈춰 있어야 한다.

단계별 실패의 영향:

| 단계 | 실패하면 운영은 | 근거 |
| --- | --- | --- |
| A–D | 바뀌지 않는다. A3 시드는 예외다 | 읽기, 운영 복사본, 저장소 밖 파일만 다룬다 |
| A3 시드 | 2026-10-28부터 운영에서 쓰던 묶음으로 맞춘다 | 운영 기록 |
| E1 | 추가된 표·제약만 남는다. 지금 main과 호환된다 | 추가형 마이그레이션 |
| E2–E4 | 서버 X가 legacy로 돈다. 0.5.33은 정상이고 0.6.1은 거부된다 | 출시 조합 표 |
| F 거부·실패 | 바뀌지 않는다 | 한 transaction의 rollback, 결과는 성공 시에만 기록 |
| F 성공 뒤 | versioned로 고정된다 | legacy로 내리는 복구 없음 |
| G 번들 hook 실패 | 이 PC만 영향을 받는다 | G4의 소스 설치로 대신한다 |

비공개 자료:

- snapshot, evidence, 프로필, secret 값 파일은 저장소, artifact, summary, 대화에 올리지 않는다. OneDrive 밖에 둔다.
- CLI 출력은 hash, ID, revision뿐이다(`bootstrap-template-releases.ts:35`, `:50`).

확인한 항목:

- [x] 출시된 plugin·서버와 함께 쓰는 상태를 표로 확인했다. 0.5.33·0.6.1과 legacy·versioned의 네 조합은 Current State 표에 있다.
- [x] API 계약: 템플릿 GET, `POST /api/runbook`(`src/server/rest/runbook-handler.ts:68`), MCP 진행 도구의 거부 경로를 확인했다.
- [x] Windows 번들 hook 경로를 A5로 확인했다. 결과는 Verification Results에 있다.
- [x] Vercel의 이전 production 배포 URL은 legacy reader로 남지 않는다. 인증 없는 요청은 Vercel SSO로 보내진다(A6, 2026-11-05).

## Approval

승인 기록은 front matter가 기준이다. 운영 쓰기(E1, E2 두 번, F8)는 실행 직전에 따로 승인받았다. E4 1차 실패 뒤의 수정 경로와 client-init-smoke 예외도 각각 사용자가 승인했다.

필요했던 승인:

1. 이 계획 전체. TPL4(R0)의 운영 범위 승인(BLK-TPL-04)이며, 복구 책임자는 사용자다. 원 제안서의 approval-scope는 운영 이관을 제외하므로 이 문서가 그 범위를 맡는다.
2. 운영 쓰기 단계마다 실행 직전의 개별 승인: A3(필요할 때만), E1, E2, F8.
3. 사용자가 직접 하는 단계: E4·F8의 배포 job 승인. secret 입력(E4·F5)과 F7의 `pg_dump`는 WSL에서 한다. B1은 사용자 승인 뒤 `gh`로 만든다. C2의 운영 읽기는 실행 직전에 승인받는다.

## Execution Plan

1. Phase A: push CI, 운영 집계, 템플릿 대조, WSL, Windows 번들 launcher 비교, Vercel 보호 확인
2. Phase B: environment, 프로필과 secret 값, 전달 경로 준비
3. Phase C: 운영 데이터 사본으로 로컬 리허설과 백업 사본 확인
4. Phase D: 승격 커밋 X와 게이트, X 번들 패키징
5. Phase E: 운영 마이그레이션, main 승격, 배포와 `status` 확인
6. Phase F: 유지보수 시간의 snapshot, evidence, bootstrap
7. Phase G: 이 PC 0.6.1 전환과 인수, 기록
8. Phase H: 별도 승인 뒤 R1과 포인터 복구

## Verification Plan

실행할 검증:

```bash
npm run verify:plugin-version
gh workflow run client-init-smoke.yml --ref dev
gh workflow run agent-eval.yml --ref dev
gh workflow run pipeline-smoke.yml --ref dev
node --env-file=<production env file> node_modules/prisma/build/index.js migrate status
HARNESS_RELEASE_SOURCE=<private checkout> HARNESS_RELEASE_COMMIT=<full SHA> npm run test:template-release
node scripts/windows/windows-role-runtime-cache.mjs verify --runtime <runtime directory>
node scripts/windows/package-windows-plugin.mjs --output <new directory outside the repository> --runtime <runtime directory>
gh workflow run template-release.yml --ref main -f operation=status -f environment=production -f source_commit=<sha> -f request_id=<id>
gh workflow run template-release.yml --ref main -f operation=bootstrap -f environment=production -f source_commit=<sha> -f request_id=<id>
gh workflow run template-release.yml --ref main -f operation=result-bootstrap -f environment=production -f source_commit=<sha> -f request_id=<id>
```

검증 기준:

- A5: 허용·거부 출력이 `node` 직접 실행과 같고, 한글이 보존되고, 종료 코드가 0이고, 시간이 hook 제한 15초 안이다.
- 리허설 bootstrap이 거부 없이 끝나고, 같은 요청 ID 재실행 결과가 같고, 걸린 시간이 15초 이하다.
- 리허설 백업 사본의 채널 상태가 legacy·revision 0·장벽 false다.
- 모든 게이트가 X를 가리키고 녹색이다.
- 승격 뒤 `dpl_` id가 일치하고, `status`가 legacy·revision 0이고, 승인 대기 중에 넣은 secret이 쓰였다.
- 전환 뒤 `status`가 versioned·revision 1·장벽 true이고 `result-bootstrap`이 같은 결과다.
- 0.6.1 init이 ready가 되고, 열린 실행이 새 receipt로 재개되며, 새 실행이 R0에 pin된다.

## Verification Results

Phase A~G를 실행했다. Phase H는 범위 밖이다. 인수 보고서는 [2026-11-05-template-release-production-cutover.md](../../test-reports/completed/2026-11-05-template-release-production-cutover.md)다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| A1 push CI(`3e69c58`) | 녹색 | check 41795036844, windows-role-runtime 41795036371, macos-runtime-contracts 41795036372 |
| fb6ef955 `test:template-release` | 2 pass | 구현 보고서 기록에 더해 `3e69c58`에서 Windows 로컬로 다시 실행했다(4초) |
| A5 launcher 비교(`3e69c58`) | PASS | 아래 참고 |
| A6 Vercel 이전 배포 보호 | 보호됨 | 최근 production 배포 3개(`7d5c893`, `5dcab73`, `f2d7196`)의 고유 URL이 인증 없이 302를 돌려준다. `f2d7196`은 페이지, `/api/health`, `/api/mcp` POST 모두 Vercel SSO로 보냈다 |
| A2 운영 집계 | 완료 | 중단 조건 없음, 시드 불필요. 아래 참고 |
| A4 WSL 준비 | 완료 | `3e69c58` detached clone, `npm ci` 18초, `db:generate`, bootstrap CLI `--help` 실행, 작업 트리 깨끗함. `~/.stagekeeper`는 0700 |
| B2 프로필(production) | 완료 | WSL `~/.stagekeeper/template-targets.json`과 secret 값 파일(둘 다 0600). 운영 주소는 이미 direct였다. `readTemplateTarget`이 받아들였다(identity `9ad60b1b995f…`). staging 항목은 C1 뒤에 더한다 |
| B1 environment | 완료 | `template-production`: 필수 검토자 Sangeok(본인 승인 허용), 배포 브랜치 `main`만, secret 0개 |
| B3 전달 경로(비밀 gist) | 통과 | 3MB 더미를 secret gist로 올리고 워크플로와 같은 `curl`로 받았다(634ms, sha256 일치). 주소를 출력하지 않고 stdin으로 secret에 넣은 뒤 지웠다. raw 응답은 `Cache-Control: max-age=300`이다. gist를 지운 뒤에도 271초까지 200, 301초에 404였다 |
| Phase C 로컬 리허설 | 통과 | 아래 참고 |
| Phase D 게이트(X=`3e69c58`) | 녹색 | `verify:plugin-version` 0.5.33 → 0.6.1, push CI 3종(A1), client-init-smoke 41991140031(4 job), agent-eval 41991143728, pipeline-smoke 41991608561(pluginCommit `3e69c58`, 템플릿 fb6ef955, `harnessErrors` {}, `stepRefusals` 0). 리허설 커밋이 X와 같아 C·A5는 다시 하지 않는다. D3 번들은 A5에서 같은 커밋으로 만든 것을 쓴다 |
| E1 운영 `migrate deploy` | 완료 | 2026-11-05 10:59Z. 직전 `migrate status`로 미적용이 위 두 개뿐인지 다시 보고 적용했다(17.5초). 이후 `migrate status`는 up to date다. WSL CLI의 읽기 전용 `--status`로 본 채널은 legacy·revision 0·장벽 false·active 없음이다. 지금 main 서버는 `/` 200, `/api/mcp` 401(인증 필요)로 정상이다 |
| WSL `gh` 준비 | 완료 | gh 2.46.0. 토큰은 명령마다 환경 변수로 넘기고, WSL에는 로그인을 저장하지 않았다. `template-production` secret 조회(0개)까지 확인했다 |
| E2 main push | 완료 | 2026-11-05 11:25:48Z, main `7d5c893` → `3e69c58`(fast-forward) |
| E3 배포 대조 | 일치 | push 47초 뒤 Vercel production 배포가 success였고, stagekeeper.dev HTML의 `dpl_`가 그 배포와 같다. `/` 200, `/api/mcp` 401 |
| Phase E `status` 1차(run 42018963171) | 실패 — 검증 job | 운영에는 닿지 않았다(배포 job skipped). 아래 참고 |
| Y 수정 PR #292 | 머지 | PR check 6개와 Vercel 녹색, dev 머지 커밋 `e5b05a2`. WSL에서 러너와 같은 조건으로 비공개 시험 2개 pass, eslint ok, `verify:plugin-version --base origin/main --head Y` 통과(출하 플러그인 변경 없음) |
| client-init-smoke(Y, 42020946512) | new-user 2/2 통과, update 2/2 실패 | update는 `previous-dry-run`에서 `Template release protocol is not active`로 멈췄다. 아래 참고. 사용자가 예외를 승인했다 |
| E2 재실행: main → Y | 완료 | 2026-11-05 12:18:21Z, main `3e69c58` → `9516f1d`(fast-forward) |
| E3 재실행(Y) | 일치 | main check 42026011892 success(12:20:39Z). 그 1초 뒤 Vercel success, HTML `dpl_`가 그 배포와 같다. `/` 200, `/api/mcp` 401 |
| Phase E `status`(run 42026334065) | 성공 | 검증 job 65초(`npm ci` 48초, 비공개 시험 1초). 배포 job은 12:22:02Z부터 승인을 기다렸다. 그 사이 12:22:11Z에 WSL `gh`로 `TEMPLATE_TARGET_PROFILES`를 처음 넣었고, 승인 뒤 43초 만에 끝났다(`npm ci` 28초, 실행 1초). 승인 대기 중에 넣은 secret이 쓰였다. job summary는 API로 읽을 수 없어 WSL `--status`로 같은 채널을 읽었다. legacy·revision 0·active 없음·장벽 false다 |
| F1 bootstrap 실행(run 42027310590) | 성공 | 검증 job 60초. 배포 job은 12:28:57Z부터 승인을 기다렸다 |
| F2 writer 정리 | 완료 | 12:35Z와 12:37Z에 읽기 전용으로 점검했다. 마지막 쓰기 약 5시간 20분 전, Runner 0, 열린 AgentRun 0, 다른 DB 연결 0이다. 이 PC에는 하네스 watch·실행기·Codex 도우미 프로세스가 없었다. 사용자가 전환까지 쓰지 않기로 확인했다 |
| F3·F4 | 완료 | snapshot 7.2초, 389KB(0600), hash `69558ad309cd…`, identity `9ad60b1b995f…`. evidence는 inventory 13, excluded 0, unbound 0, readers `vercel-production:dpl_GZP6…`(Y), writersDrained true다 |
| F5·F6 | 완료 | 비밀 gist(public false), secret 2개(12:37:37–38Z). URL로 받은 파일의 sha256이 로컬 snapshot과 같다 |
| F7 백업 | 완료 | 기준 시각 2026-11-05T12:37:38Z. `pg_dump` 25.4초, 190KB(0600, WSL). 임시 DB 복원 오류 0, 채널 legacy/0, Template 13, 열린 실행 7/1/0, 마이그레이션 35. 확인 뒤 임시 DB를 지웠다 |
| F8 배포 job | 성공 | 12:46:07Z 시작, 60초(`npm ci` 49초, 실행 3초) |
| F9 정리 | 완료 | run이 끝나고 7초 뒤 gist를 지웠다(API 조회 gone). URL secret도 지웠다. 남은 secret은 `TEMPLATE_CUTOVER_EVIDENCE`, `TEMPLATE_TARGET_PROFILES`다 |
| F10 결과 | 일치 | status는 versioned·revision 1·active `fc20ccfd…`·장벽 true다. 같은 요청 ID의 result는 `{releaseId: fc20ccfd…, revision: 1, previousReleaseId: null}`이다. 열린 PipelineRun 7/7과 PipelineWorkRun 1/1이 active release에 pin됐고, 열린 AgentRun은 0이다. release 1개, entry 13개 |
| G1 번들 설치 | 완료 | D3 번들(sourceRevision `3e69c58`. Y와 출하 파일이 같다)을 marketplace `harness/`에 넣고 marketplace·plugin update를 했다(user scope 0.5.33 → 0.6.1). 캐시 2,238개 sha256이 전량 일치하고, 여분은 `windows-package.json`뿐이다. template-guard hook이 들어 있다. `harness.ps1 session`은 runtime 검증을 통과했다(첫 실행 4.4초). 옛 번들은 `harness-0.5.33-backup`이다 |
| G2 재init | 완료 | 아래 참고 |
| G3 인수 | 부분 | 0.6.1이 적용된 새 headless Claude로 harness-smoke에서 `project_get`과 `pipeline_next`를 불렀다. 둘 다 거부 없이 응답했고, 응답의 templateRelease가 R0다(head는 work-assigner dispatch, ITEM-03은 impl-verify 대기). native hook이 실제 Claude Code에서 처음 돈 확인이다. 비용 추정 $0.28. `agent_next`와 새 AgentRun의 R0 pin은 첫 실제 실행에서 확인한다. CI pipeline-smoke 41991608561이 같은 판과 같은 R0 템플릿으로 배정부터 인수까지 확인했다 |
| G7 WSL 정리(1차) | 완료 | WSL 프로필과 secret 값 파일을 지웠다. `TEMPLATE_CUTOVER_EVIDENCE`도 지웠고 남은 secret은 `TEMPLATE_TARGET_PROFILES`뿐이다. WSL `gh`에 저장된 로그인은 없다. snapshot, evidence, `pg_dump`, 비공개 템플릿 clone은 며칠 뒤 지운다 |

G2 결과(2026-11-05):

- 이 PC에 연결된 저장소는 `harness-smoke`와 `mathgic` 두 개다. 둘 다 lock v1이었고, CLAUDE.md는 전부 관리 블록이었다. CLAUDE.md를 바꾼 커밋도 모두 init 커밋이었다.
- 두 블록은 옛 템플릿(10-08, 09-29)으로 렌더한 것이다. lock v1에는 블록 hash가 없어서 0.6.1은 R0 렌더나 기준 렌더와 같을 때만 블록을 교체한다. 그래서 미리보기가 `Unverified or modified Claude managed block`으로 멈췄고, `--adopt`로 미리보기를 다시 보여 준 뒤 사용자 승인을 받아 실행했다.
- mathgic은 바로 ready가 됐다(lock v2, R0, 관리 블록 hash 기록).
- harness-smoke는 `docs/plans/README.md`를 보존했다. 09-11 smoke 항목 FEAT-05·FEAT-07이 이 관리 파일을 고쳤기 때문이다. 그래서 `installation remains pending`이었다. 사용자 결정으로 이 파일을 하네스 판으로 되돌렸고(수정본은 git 이력에 남음), 다시 실행해 ready가 됐다.
- MCP 등록은 user scope `https://stagekeeper.dev/api/mcp`(연결됨)이다. 두 프로젝트 모두 `project_sync`가 성공했다. 바뀐 파일은 커밋하지 않고 각 저장소의 작업 트리에 두었다.

인수 중 관찰(후속 검토):

- 옛 템플릿으로 init한 저장소는 0.6.1로 올릴 때 한 번 `--adopt`가 필요하다. 업그레이드 안내에 넣을지 검토한다.
- 프로젝트 작업이 관리 파일을 고치면 0.6.1에서는 init을 다시 해도 ready가 되지 않는다. 수정본을 버리는 것 말고는 길이 없다.
- versioned 모드의 `/api/runbook`은 runbook 판을 저장하지 않는다(`src/server/rest/runbook-handler.ts`). 그래서 `project_get`의 `runbookVersion`은 legacy 시절 값으로 남는다(harness-smoke `b5257ea7e9cd`, 설치본 `dea1fd4ed5aa`). 이번 확인에서 `pipeline_next`가 runbook 경고를 내지는 않았다.

A5 결과(2026-11-05):

- 번들: windows-role-runtime 41795036371의 artifact를 검증하고 패키징했다. 2,238개 파일, runtime sha256 `0148976b…`다.
- 허용 출력은 `node` 직접 실행과 같았다. installation이 주입됐고, 위조한 installation은 덮어써졌으며, permission은 내리지 않았다. 5회 모두 같았다.
- 한글·따옴표·역슬래시를 넣은 필드가 그대로 보존됐다. 출력에 BOM과 CRLF가 없었다.
- 역할 파일을 바꾼 거부 출력도 같았다(`deny`). 종료 코드는 모두 0이었다.
- 시간: 번들 첫 실행 5,342ms, 이후 834–870ms다. `node` 직접 실행은 153–163ms다. 두 값 모두 hook 제한 15초 안이다.
- 호출마다 약 0.7초가 더 드는 것은 launcher가 매번 PowerShell을 띄우고 runtime hash를 검사하기 때문으로 보인다. 따로 나눠 재지는 않았다.

A2 결과(2026-11-05, 수동 모드, `BEGIN TRANSACTION READ ONLY`):

- 대상은 운영 endpoint다. 미적용 마이그레이션은 위 두 개뿐이고, 실패하거나 로컬에 없는 마이그레이션은 없다. `TemplateChannel` 표는 아직 없다.
- snapshot 대상 12개 표는 모두 작다. 행 수는 Template 13, Project 4, Workspace 4, PipelineVersion 19, PipelineWorkRun 4, PipelineRun 18, AgentRun 81, AgentRunStep 238, BoardItem 18, BacklogItem 20, Report 30, TransitionEvent 157이고, 표 크기 합은 약 1.4MB다.
- 열린 실행: PipelineRun 7개, PipelineWorkRun 1개, 모두 `slots-v1`이다. 보드의 현재 실행과 어긋나거나, 버려진 항목이거나, entry가 없는 것은 0개다. 열린 AgentRun은 0개이고 revision 최댓값은 4다.
- 프로젝트 4개의 언어는 모두 `en`이다.
- 사용자는 1명이고 최근 7일 활동도 그 1명이다. 마지막 역할 시작은 집계 24분 전이었다.
- 운영 Template 13행이 fb6ef955 13행과 모두 같다. A3 시드는 하지 않고 R0 커밋은 fb6ef955다.

C 결과(2026-11-05, 리허설 커밋 `3e69c58`):

- 운영 접속: 전환 도구의 접속 코드로 운영(PostgreSQL 18.6)에 1.8초 만에 연결했다.
- 운영 사본: `pg_dump` 165KB, 복원 오류 0. 로컬 사본은 Template 13, 열린 PipelineRun 7, 열린 PipelineWorkRun 1, 열린 AgentRun 0, 적용된 마이그레이션 33으로 A2와 같았다.
- `migrate deploy`는 1.9초였다. 그 뒤 채널은 legacy·revision 0·장벽 false였다.
- snapshot은 0.86초, 389KB(0600)다. B3에서 시험한 gist 크기(3MB) 안이다.
- evidence: inventory 13, excluded 0, unboundRuns 0.
- bootstrap은 0.66초였고 `{releaseId, previousReleaseId: null, revision: 1}`을 돌려줬다.
  - `status`는 versioned·revision 1·장벽 true였다.
  - 같은 요청 재실행과 `--result` 조회도 같은 결과였다.
- 열린 PipelineRun 7/7과 PipelineWorkRun 1/1이 pin됐다. 열린 AgentRun은 0이었다.
- 백업 사본은 legacy·revision 0·장벽 false였다.
- 정리: 리허설 DB 0개. 받은 사본, snapshot, evidence를 지우고 프로필에는 production 항목만 남겼다.

E4 1차 실패(2026-11-05):

- 검증 job의 `test:template-release`가 `codex/free/en`에서 실패했다. claude 조합은 모두 통과했고 그다음 첫 Codex 조합에서 멈췄다.
- 원인은 시험 환경이다. Codex init은 검증 스킬을 `HARNESS_VERIFIER_SKILL_DIR`, 없으면 `~/.codex/skills/reconciling-proposals-with-codebase`에서 읽는다(`plugin/runtime/codex-agent.mjs`의 `defaultVerifierDirectory`).
  - 다른 init 시험은 이 경로를 직접 넘긴다(`plugin/templates/templates.test.mjs`, `plugin/bin/harness-init-dual.test.mjs`).
  - `tests/templates/private-template-release.test.ts`만 넘기지 않아 실행 기기의 Codex 설치에 기댄다.
  - 이 PC에는 스킬이 있어 로컬 실행은 통과했다. 스킬이 없는 GitHub 러너에서는 실패한다. 이 워크플로는 처음 실행됐고, check는 비공개 시험을 돌리지 않아 지금 드러났다.
- WSL에서 X로 같은 실패를 재현했다. 같은 명령에 `HARNESS_VERIFIER_SKILL_DIR`만 주면 2개 모두 통과했다.
- dev 끝(`71613fe`, #291)은 더 새 템플릿 커밋을 요구하는 시험과 출하 플러그인 변경을 담고 있어 지금 승격할 수 없다.

수정 경로(2026-11-05 사용자 승인):

- X에서 분기한 `harness/template-release-verifier-fixture`에 시험 수정 커밋 Y(`9516f1d`)를 만든다. AGENTS.md의 "최신 dev에서 분기" 규칙의 예외다.
  - 시험이 다른 init 시험처럼 fixture 검증 스킬을 만들어 `HARNESS_VERIFIER_SKILL_DIR`로 넘긴다.
  - 플러그인과 서버 파일은 그대로다. 판은 0.6.1을 유지하고, Phase C 리허설과 A5·D3 번들 결과도 그대로 유효하다(Phase D 2의 재실행 조건에 해당하지 않음).
- PR을 dev에 머지한다. 머지 커밋의 부모로 Y가 dev 이력에 들어가므로 main은 X에서 Y로 fast-forward할 수 있다.
- AGENTS.md 게이트 가운데 Y에서 다시 하는 것: push CI(main push의 check), `verify:plugin-version`, client-init-smoke. agent-eval과 pipeline-smoke는 출하 플러그인과 지정 경로가 바뀌지 않아 대상이 아니다.
- 그 뒤 E2(main → Y), E3, E4를 다시 하고, F의 evidence codeSha는 Y다. WSL checkout도 Y로 옮긴다.

client-init-smoke 예외(2026-11-05 사용자 승인):

- Y에서 update 시나리오 2개가 실패했다. 이 시나리오는 지금 main의 플러그인을 이전 판으로 설치하고, legacy로 시드한 시험 서버에서 먼저 init한다.
- E2로 main이 0.6.1이 되자 이전 판도 0.6.1이 됐다. 0.6.1은 legacy 서버에서 설계대로 거부되므로, 지금은 어느 커밋에서 돌려도 update가 첫 단계에서 실패한다.
- 이번 변경의 출하 플러그인과 서버 코드는 X와 같다. 실제 업데이트 경로인 0.5.33 → 0.6.1은 X의 게이트(41991140031)에서 두 OS 모두 통과했고, Y의 new-user도 두 OS 모두 통과했다. 그래서 "모든 job 녹색"의 예외로 진행했다.
- 후속: 이전 판이 0.6.1 이상이면 update 시나리오가 전환부터 하도록 `scripts/rehearsals/rehearse-client-init-smoke.ts`를 고친다. 다음 승격(#291 등) 전에 필요하다.

## Risks and Rollback

잔여 리스크:

- 운영 사용자는 본인 1명이다(A2). drift는 이 PC나 다른 기기의 실행기·watch가 남아 있을 때만 생긴다. F2에서 모두 멈춘다.
- bootstrap timeout은 30초다. C5의 로컬 bootstrap은 0.66초였다. 운영에서는 GitHub 러너에서 Neon까지 왕복이 더해지지만, 데이터가 작아 제한과는 거리가 멀다.
- Vercel의 이전 배포 URL은 배포 보호로 막혀 있다(A6). 전환이 끝날 때까지 이 설정을 끄지 않는다.
- windows-role-runtime artifact는 7일 동안만 보관된다. D3은 X의 CI 실행 뒤 7일 안에 한다.
- 번들 hook은 A5를 통과했지만 실제 Claude Code에서는 G1에서 처음 실행된다. 실패하면 G4로 대신한다.
- 운영 브랜치의 시점 복원은 이력 보관 기간 안에서만 된다. 이 프로젝트는 Free라 6시간이다. G의 인수 확인은 전환 직후 이어서 하고 6시간 안에 끝낸다. 기간이 지나면 F7의 `pg_dump` 파일로 복원하는 길만 남는다.
- Neon Free 한도: 리허설을 로컬에서 해서, 이 계획이 더 쓰는 Neon compute는 운영을 읽은 몇 초와 전환 중 조회뿐이다. 다만 운영 자체 사용량이 이미 한도에 가까우면 운영 compute가 멈출 수 있다. 콘솔을 쓰지 않기로 해서 사용량은 확인하지 않는다.
- Codex 경로는 이번에 인수하지 않는다.
- snapshot은 gist에 올린 뒤 지울 때까지, 그리고 지운 뒤 캐시로 최대 5분 동안 주소를 아는 사람이 받을 수 있다. 주소는 출력하지 않고 secret에만 둔다. 배포 job이 끝나면 바로 지운다(F9).

롤백 방법:

- A–D 뒤: 운영에 바뀐 것이 없다. A3에서 시드했다면 시드 전 행은 `--snapshot` 파일에 남아 있다.
- E1 뒤: 추가형이므로 그대로 둔다.
- E2–E4 뒤(서버 X, legacy):
  - 서버 문제면 Vercel에서 이전 production 배포로 즉시 되돌린다. 추가형 schema와 호환된다.
  - main은 되돌리지 않는다. 수정은 dev를 거쳐 다시 승격한다.
  - 0.6.1 설치는 미룬다.
- F가 거부·실패하면 rollback으로 운영이 바뀌지 않는다. 원인을 처리한 뒤 새 snapshot과 새 요청 ID로 F1부터 다시 한다.
- F 성공 뒤:
  - legacy로 내리는 복구는 없다.
  - 서버 결함은 고친 커밋을 versioned에서 검증한 뒤 다시 승격한다.
  - R0 내용 문제는 Phase H 도구로 고친 묶음을 import·activate한다.
  - 데이터가 손상되면 두 길이 있다. 어느 쪽이든 전환 뒤의 쓰기를 잃으므로 별도 승인이 필요하다.
    - 이력 보관 기간 안: Neon 콘솔에서 운영 브랜치를 F7에 기록한 시각으로 시점 복원한다. 연결 주소는 그대로다. dev 같은 하위 브랜치는 복원 전 상태의 백업 아래로 옮겨진다.
    - 기간이 지난 뒤: F7의 `pg_dump` 파일을 복원한다. 새 DB에 복원하고 Vercel과 `production.env`의 연결 주소를 바꾸거나, 운영 DB에 직접 복원한다.
  - 복원하면 legacy 상태가 되어 0.6.1은 다시 거부되고 0.5.33이 동작한다. 이 PC는 G1에서 백업한 번들로 되돌린다.

## Completion or Closure Notes

완료 기록(`status: "completed"`일 때 작성):

- completed-at: 2026-11-05
- verification-summary: front matter와 Verification Results, 인수 보고서를 따른다.
- implementation PR/commit:
  - #292(시험 수정, dev 머지 커밋 `e5b05a2`)
  - main `7d5c893` → `3e69c58` → `9516f1d`
  - 이 기록 PR
- changed files summary:
  - 코드 변경은 `tests/templates/private-template-release.test.ts` 하나다(#292).
  - 운영에는 마이그레이션 2개, versioned 채널과 R0, GitHub environment `template-production`과 secret `TEMPLATE_TARGET_PROFILES`가 생겼다.
  - 이 PC는 플러그인 0.6.1로 바뀌었다. harness-smoke와 mathgic은 재init했고 커밋은 사용자 몫이다.
- remaining follow-up:
  - 첫 실제 실행에서 `agent_next`와 새 AgentRun의 R0 pin을 확인한다.
  - WSL의 snapshot, evidence, `pg_dump`, 비공개 템플릿 clone은 며칠 뒤 지운다.
  - client-init-smoke update 시나리오가 이전 판이 versioned일 때 전환부터 하도록 고친다. 다음 승격 전에 필요하다.
  - 인수 중 관찰 세 가지를 검토한다(`--adopt` 요구, 관리 파일 수정 시 pending, `runbookVersion`).
  - Phase H(R1과 포인터 복구)는 별도 승인으로 한다.
  - Neon compute 사용량 줄이기를 바로 이어서 한다.

닫힘 기록(`status: "closed"`일 때 작성):

- closed-at: TBD
- closed-by: TBD
- closed-reason: TBD
- close summary: TBD
- remaining follow-up: TBD

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했고, pending 문서의 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [x] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다. `active/`는 `pending`, `completed/`는 `completed` 또는 `closed`다.
- [x] `stage`는 pending 문서에서만 사용했고, `completed` 또는 `closed` 문서에서는 `stage: null`로 갱신했다.
- [x] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다.
- [x] `proposal-size`는 `small` 또는 `standard`만 사용했고, standard 강제 조건에 해당하는 작업을 small로 낮추지 않았다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 승인 조건과 참고 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다.
- [x] 잔여 리스크를 명시했다. 없으면 "없음"이라고 적었다.
- [x] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다.
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다.
