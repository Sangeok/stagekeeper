# 템플릿 릴리스와 실행 선택

서버는 `TemplateChannel.default.mode`로 legacy와 versioned 경로를 구분한다.
additive migration만 적용하면 legacy다. 운영 전환은 별도의 유지보수 승인과
`bootstrap-template-releases.ts`의 원자적 commit이 필요하다.
운영은 2026-11-05에 R0로 전환해 versioned다. 이후 운영 템플릿 변경은
`template-release.yml`의 import와 activate로만 하고, legacy seed는 writer 장벽이 거부한다.
2026-11-10에 R1(비공개 템플릿 `8ccb37a`)을 활성화했다. Claude 검증 스킬 호출 문구 시험이 들어간
코드부터는 모든 operation이 그 시험을 통과하는 R2 원본 커밋을 `source_commit`으로 쓴다. 검증
job이 어느 operation에서든 그 커밋에 비공개 릴리스 시험을 돌리고, R1 원본 `8ccb37a`는 그 문구
시험에서, R0 원본 `fb6ef955`는 수렴 계약 시험에서 실패하기 때문이다. R2의 SHA와 활성화 날짜는
활성화 뒤 기록한다.

## 저장과 실행

`TemplateRelease`와 `(releaseId, lang, path)` entry는 seal 이후 변경·삭제할 수 없다.
등록은 채널을 바꾸지 않는다. `releaseIdentity`는 원본 식별자, manifest 형식,
정규화 본문 hash, 해석 계약 hash를 함께 식별한다. 동일 요청의 결과는
append-only `TemplateDeployment`에서 재조회한다. 같은 요청 ID에 다른 입력은 거부한다.

root 실행은 생성 transaction에서 채널을 읽고 잠가 선택을 저장한다. 자식은 부모의
release/language를 상속한다. 재개는 활성 채널이나 바뀐 프로젝트 언어를 읽어 선택을
바꾸지 않는다. 현재 인증·접근·plan·usage 정책은 계속 적용한다.
`pipeline/template-selection.ts`는 core 정책과 DB를 사용하며 templates 서버 모듈을
참조하지 않는다. `agents`의 조회·파싱·렌더·receipt·쓰기에는 같은 cursor transaction을 쓴다.

slots-v1 역할은 `entry`로, 기존 형식 역할은
`execution: {kind: "legacy", runId, node}`로 결합한다. 독립 역할은
`execution: {kind: "standalone"}`을 명시한다. 실행 ID와 역할 receipt ID는 구별한다.
부모와 선택은 DB guard도 보호한다. 과거 미상 closed 행의 reopen은 새 root를 만들고,
그 행에 과거 선택이나 부모를 소급하지 않는다.

## 다운로드와 설치

versioned `GET /api/templates`는 `templateProtocol=template-release-v1`과 선택적인
`release`를 받는다. release 생략은 active이며 요청 언어가 없으면 **선택한 같은 묶음의**
영어로 fallback한다. 알 수 없는 ID 또는 fallback 부재는 404다. 구형 요청 및 legacy
서버에 대한 버전 설치 요청은 400이다. 인증·현재 접근·요청 제한이 본문 조회보다 먼저다.
응답에는 `private, no-store`를 사용한다.

본문은 기존 deliverable의 plan 필터·alias·stub 경계를 유지한다. 공개된 역할과 런북에만
manifest의 설치 지침을 붙인다. `templateContract`는 지원하는 해석 규칙과 이 공개 지침이며
private step은 포함하지 않는다. `templateRelease`는
`{id, schemaVersion:1, protocol, language, clientSurfaceHash}`다. hash는 client, 유효 언어,
해석 계약, 정렬된 공개 path/body를 포함하며 release ID와 private step은 제외한다.

MCP의 `installation`은 `{releaseId, language, protocol, clientSurfaceHash}`다.
서버는 고정된 실행과 현재 plan에 대해 호환성을 검사한다. 설치 ID로 실행의 선택을
바꾸지 않으며 공개 표면이 같은 다른 ID는 호환된다. 비호환 항목은 `wait/template`,
head는 `none`으로 필요한 templateRelease를 반환한다. 아직 실행이 만들어지지 않은
항목의 template wait에만 node/version이 null일 수 있다. 다른 항목은 계속 제공한다.

양 client의 `POST /api/runbook`은 `{project?, client, version, installation}`을 받고
선택된 묶음·현재 plan·공개 런북의 기존 12자리 버전을 확인한다. 성공은 `{ok:true}`다.
versioned 경로는 `Project.runbookVersion`을 설치 권위로 사용하거나 덮어쓰지 않는다.

`harness-init --release <ID>`로 고정된 과거 실행의 설치를 선택할 수 있다. lock v2는
client별 tuple, config의 SHA-256, 관리 파일 목록·hash, pending/ready를 저장한다.
Claude는 파일 전체 대신 관리 블록 hash를 추적해 바깥 사용자 내용을 보존한다.
검증되지 않은 legacy 블록은 기준 렌더와 일치하거나 명시적으로 adopt한 경우만 교체한다.

init은 session guard로 세션 부재를 확인하고 init guard를 파일 쓰기·서버 보고·재검증·
ready commit까지 유지한다. session 시작은 같은 guard 안에서 init 부재를 확인한다.
쓰기 전에 대상 client를 pending으로 만들고, 실제 공유 파일 또는 config가 달라지면
다른 client도 pending으로 만든다. 실패·skip(modified)·응답 유실은 파일을 보존하고
성공을 보고하지 않는다. offline `HARNESS_TEMPLATES_DIR`는 pending preview다.

공통 MCP·Claude watch·Codex bridge와 세션 helper는 실제 설치 파일을 재검사한다.
Claude plugin의 `hooks/hooks.json`에서 템플릿 hook은 두 MCP 진행 도구만 대상으로 삼고 설치 tuple을
주입하되 permissionDecision allow를 내리지 않는다. 같은 파일의 커밋 hook은
[역할 커밋 경계](./protocol.md#역할-커밋-경계)를 따른다. 오류 시 차단하는 native hook에는
Claude Code 2.1.295 이상과 재시작이 필요하다. native 실패 차단 기준은
[공식 hook 계약](https://code.claude.com/docs/en/hooks)을 따른다. Windows bundle은 검증된 내장 Node와
PowerShell launcher로 같은 hook을 실행한다. source 설치는 기존 PATH Node 계약을 유지한다.
다른 client 설치·로그인은 요구하지 않는다.

## 최초 이관과 복구

`bootstrap-template-releases --snapshot <private absolute file>`은 전체 Template,
실행 계보·단계 원장·보고·전환 증거와 선택에 필요한 현재 값을 일관된 읽기 transaction으로
저장한다. 인증 credential은 저장하지 않는다. snapshot/evidence/target profile은 checkout
바깥의 일반 파일이며 mode 0600을 요구한다. snapshot의 전체 data hash를 다시 검증한다.

운영자는 writer/RPC/역할 정리와 모든 reader의 동일한 지원 코드 SHA를 확인한 뒤
`TemplateCutoverEvidence`를 승인한다. schema에는 snapshotHash, targetIdentityHash,
codeSha, maintenanceReference, writersDrained, readers, inventory, excluded,
unboundRuns가 있다. 모든 legacy 행을 inventory 또는 사유가 있는 excluded 중 하나에
넣는다. 열린 미결합 역할은 유일하게 입증한 부모·현재 노드 또는 독립 실행 증거가 필요하다.

서비스는 legacy 표와 계보를 잠근 뒤 snapshot hash를 재대조한다. R0 seal,
legacyEvidence 동결, 열린 선택/부모 연결, 열린 receipt revision 1회 증가,
legacy writer 장벽, versioned 채널과 결과를 한 transaction으로 저장한다.
revision 상한·부모 모호성·없는 현재 step·snapshot drift는 모두 rollback한다.
R0 출처는 legacy-snapshot이며 Git 이력을 추정하지 않는다. closed 과거 기록은 미상으로 남긴다.
동결한 후보/step ID는 원래 node/enteredAt에서만 기존 selector 조건과 함께 사용한다.

`activate-templates --status true`는 현재 mode·active ID·revision·writer 장벽을
읽기 전용으로 조회한다. 활성화·포인터 복구는 sealed ID와 예상 revision의 CAS다. 과거 포인터로 돌려도 실행 pin은
바꾸지 않는다. 결과를 잃으면 같은 operation/request ID를 먼저 조회한다. 같은 GitHub run의
재실행은 원래 audit 입력을 유지한다. 새 workflow run으로 같은 ID를 덮어쓰지 않는다.
mode나 schema를 legacy로 내리는 복구는 지원하지 않는다.

## 배포 경계

`.github/workflows/template-release.yml`은 protected dev/main의 현재 코드 SHA에 대해
성공한 check를 요구하고 private source의 full SHA를 별도로 검증한다. 검증 job에는 운영
DB credential이 없다. private 원본의 스크립트는 실행하지 않고 이 저장소의 계약 시험으로
검사한다. 본문·snapshot은 공개 artifact나 summary로 올리지 않는다.

배포 job은 `template-staging` 또는 `template-production` GitHub environment의 승인·보호
설정을 사용한다. 필요한 secrets는 `E2E_TEMPLATES_TOKEN`, `TEMPLATE_TARGET_PROFILES`다.
bootstrap에는 승인된 `TEMPLATE_CUTOVER_EVIDENCE`와 private snapshot을 읽는 일회성 HTTPS
`TEMPLATE_CUTOVER_SNAPSHOT_URL`도 필요하다. 이 설정을 코드 추가가 자동으로 만들지 않는다.
production CLI는 정확한 workflow/ref/code/environment/run 증거를 확인하며, 이 검사는
GitHub environment 보호와 credential 격리를 대체하지 않는다.

import, activate, bootstrap, 각 결과 조회는 명시적으로 분리한다. import는 검증 job의
identity와 같은 입력만 허용한다. 각 대상 profile은 URL의 host/port/database/public schema와
provider routing을 명시하고 실제 연결의 database/schema를 재대조한다. dotenv나 운영
DATABASE_URL로 자동 fallback하지 않는다. 운영 migration·bootstrap·활성화·승격은
[verification.md](./verification.md)와 AGENTS.md의 별도 승인/출시 gate를 따른다.
