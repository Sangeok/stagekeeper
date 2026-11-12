# 로컬 클라이언트 어댑터

Claude의 `skills/`와 `.claude-plugin/plugin.json`, Codex의 `codex/skills/`와
`.codex-plugin/plugin.json`이 같은 `bin/`, `runtime/`, `lib/`를 사용한다.
portable root manifest는 두지 않는다. private 단계 본문은 패키지에 포함하지 않고
인증된 서버가 공급한다. `lib/`는 `packages/core`에서, `lib/github/`는 `packages/github`에서 동기화한 복사본이다.

## 편집 원본과 배포 경로

아래 표는 저장소 유지보수 기준이다. `skills/`에는 Claude 진입점과 공통 verifier 원본이
함께 있으므로 디렉터리 전체를 Claude 전용 또는 공통 스킬로 취급하지 않는다.

| 역할 | 편집할 원본 | 소비·배포 경로 |
| --- | --- | --- |
| Claude 진입점 | `skills/init/`, `skills/watch/`, `skills/background/`의 `SKILL.md`와 해당 참조 문서 | `.claude-plugin/plugin.json`의 harness 플러그인에서 제공 |
| Codex 진입점 | `codex/skills/harness-init/`, `harness-run/`, `harness-resume/`, `harness-background/`의 `SKILL.md`와 해당 참조 문서 | `.codex-plugin/plugin.json`의 `skills: ./codex/skills/`로 제공 |
| 공통 verifier | `skills/reconciling-proposals-with-codebase/`의 전체 패키지 | Claude는 이 원본을 사용하고, Windows·macOS 패키징이 Codex 경로에 완전 복사 |
| Codex verifier 배포 복사본 | 공통 verifier 원본에서 수정 | 설치 bundle의 `codex/skills/reconciling-proposals-with-codebase/`; source checkout에서 별도 원본으로 관리하지 않음 |
| 실행 helper·runtime | `bin/`, `runtime/`의 해당 소유 모듈 | 두 클라이언트의 공통 처리와 클라이언트·OS별 어댑터. 스킬은 각 진입점의 실행 계약을 따름 |
| 공통 규칙의 배포 복사본 | 저장소 루트의 `packages/core/` 생산 `.mjs` | `scripts/plugin-lib.mjs`가 `plugin/lib/`에 동기화 |
| GitHub URL 규칙의 배포 복사본 | 저장소 루트의 `packages/github/` 생산 `.mjs` | 같은 동기화 도구가 `plugin/lib/github/`에 복사 |

검증 위치도 수정 책임에 맞춰 확인한다.

- [harness-skill-references.test.mjs](bin/harness-skill-references.test.mjs)는 스킬의 일부 패키지 경로, init 출력 marker와 Claude verifier 호출 이름을 검사한다.
- [harness-session.test.mjs](bin/harness-session.test.mjs)는 Codex 진입점의 OS 거부 문구와 세션 계약을 검사한다. 문구 검사만으로 실제 모델의 준수를 판정하지 않는다.
- verifier 복사·checksum 검사는 저장소의 [Windows 패키징](../scripts/windows/package-windows-plugin.mjs)과 [macOS 패키징](../scripts/macos/package-plugin.mjs), 실행 시 완전성·staging 검사는 [codex-agent.mjs](runtime/codex-agent.mjs)와 [codex-thread.mjs](runtime/codex-thread.mjs)가 소유한다.
- lib 원본·복사본의 일치는 [plugin-lib.mjs](../scripts/plugin-lib.mjs)의 `--check`와 [회귀 시험](../scripts/plugin-lib.test.mjs)이 확인한다. 복사본을 직접 수정하지 않는다.

분리와 선별 공통화의 기준은 [스킬 유지보수 원칙](../docs/architecture/protocol.md#스킬-유지보수-원칙)을 따른다.
이 안내는 스킬 실행에 새 필수 참조를 추가하지 않는다.

## 설치와 런타임

현재 버전은 양쪽 plugin manifest를 기준으로 확인한다. 실제 설치된 winning skill/helper, 모델 권한,
DB seed, 승인 이후 양방향 재개 인수는 [보고서](../docs/test-reports/active/dual-client-runtime-report.md)의
미완료 항목이다. 아래 사용법은 설치·서버·private bundle의 같은 버전을 준비한 뒤 적용한다.

제품의 기본 연결 절차는 선택한 native 클라이언트의 기존 로그인 → Stagekeeper 플러그인
설치 → 프로젝트 연결이다. WSL·다른 CLI 로그인·별도 Node·검증 스킬 설치를 사용자에게
요구하지 않는다. 완전한 검증 스킬은 2026-10-28 결정에 따라 플러그인 source의
`skills/reconciling-proposals-with-codebase`에 포함한다. Windows install bundle은 검증된 Node·원본
npm·license를 더하고 같은 검증 스킬을 `codex/skills/`에 같은 checksum으로 두며 `bin/harness.ps1`이
helper를 실행한다. source-only checkout에는 이 생성 runtime이 없다. source에서 설치한
Claude Code 플러그인은 모든 OS에서 PATH의 Node.js로 helper를 실행하므로 Node.js가 필요하다.
Windows에서는 `bin/harness.ps1`이 runtime 디렉터리가
없을 때 Claude helper를 PATH의 `node.exe`로 실행하고, `codex` 작업이나 `--client codex` 호출은
packaging 실패로 거부한다. bundle 생성·인수·실제 배포는 각각 별도 상태이며 배포 전에 일반
사용자에게 추가 설치를 안내하거나 준비 완료를 선언하지 않는다. WSL 검증은 내부 개발 기록이다.

새 설치 배포물의 내용이 바뀌면 양쪽 manifest의 버전을 함께 올린다. Claude Code는
같은 버전의 `plugin update`를 최신 상태로 처리하고 이전 캐시를 유지하므로, 파일만
교체하는 방식은 업데이트가 아니다. 설치 후 실제 client가 선택한 캐시의 전체 inventory와
verifier checksum을 새 패키지와 대조하며 client를 재시작해 적용한다.

Windows Codex 역할의 파일 연산은 scoped MCP backend가 수행한다. 완전한 runtime이
있으면 모델 전 실제 LPAC·pipe 자식 실행·외부/AAP 파일 및 network 거부 preflight 뒤
`role_command_exec`을 추가한다. 이 도구는 허용된 repository/role scratch의 새 임시
복사본에서 명령을 실행한다. 원본·Git·인증은 변경하지 않고 복사본의 산출물은 버린다.
필요한 원본 수정은 guarded 파일 도구로 수행한다. 누락된 Git/.env/denied 의존성과 snapshot
hash를 검증 근거에 포함하며, 명령 exit 0만으로 전체 제품 인수를 선언하지 않는다.

Git 확인은 non-PM 역할의 `role_git_read`를 사용한다. 허용한 구체적인 파일에만
HEAD·기록된 planCommit의 show·diff·status를 제공한다. 원본 Git config나 hooks를
사용하지 않는 비공개 복사본에서 기존 native Git의 고정 builtin을 조회한다.
원본 index·파일을 쓰지 않으며 Git commit은 소유자에게 인계한다. 전체 저장소·다른
workspace·인증 경로의 확인이나 rename/filter/ignore/line-ending 변환은 이 결과에 포함되지 않는다.

macOS Codex는 별도 native bundle을 사용한다. `bin/harness <task> <arguments>`가 포함된
Node/npm과 scanner를 검증하고 실행하며 global Node로 우회하지 않는다. macOS 역할과
resident는 scoped 파일/Git 도구와 Seatbelt snapshot 명령을 사용한다. 시작 전 실제
권한·자식·network preflight를 수행하고, 중단 시 실행별 sandbox 식별로 분리된 후손까지
확인한다. 설치 생성기, lock v2 복구와 검증 범위는
[macOS runtime 계약](../docs/architecture/macos-runtime.md)을 따른다.

## 초기화와 명시적 실행

Codex 설치 명령은 `codex plugin marketplace add Sangeok/stagekeeper`,
`codex plugin add harness@stagekeeper-local`이다. Codex에서 `$harness-init`을 실행한다.
실제 로드된 SKILL 경로에서 plugin root를 찾으며 `CODEX_PLUGIN_ROOT`를 가정하지 않는다.
owner가 제공한 완전한 검증 skill과 실제 winning loader가 필요하다.

생성기 `node <plugin-root>/bin/harness-init.mjs --root <checkout> --server <base-url> --client codex`
는 `.codex/agents/*.toml`, `docs/harness/codex-runbook.md`, `codex-package.json`을 만든다.
기본 client는 Claude다. Codex는 `CLAUDE.md`, `.claude/`, `.mcp.json`, `AGENTS.md`를 쓰지 않는다.
양쪽 init은 공통 lock v1의 상대 client·외부 항목과 수정한 파일의 기존 hash를 보존한다.
`--dry-run`은 쓰기·guard·등록을 하지 않는다. `files-written`과 MCP 연결, 실제 실행 준비 완료는 별도 상태다.

`$harness-run` 또는 `$harness-resume`은 실행·commit·새 작업 정책을 확인하고
`harness-codex.mjs prepare --commit yes|no --propose yes|no`로 foreground 소유권을 얻는다.
helper의 `next --session <id> [--key <key>]`는 최신 client/hash를 보내 다시 조회하고,
`dispatch --session <id> [--key <key>]`는 그 응답을 새 역할 thread에 연결한다.
독립 verifier의 `--briefing` JSON은 plan-verifier면 `requiredVerificationPaths`만,
qa-verifier면 `targetCommit`과 관찰한 `testBuildIdentity`만 포함한다.
macOS의 impl-verifier는 helper가 현재 dev 보고의 commit으로 별도 검증 사본을 만든다.
이전 결론 없이 구조화된 Git 도구와 baseline·mutation·복원 검증을 수행하며 원본에서는
자기 보고서만 쓴다. Windows에서는 기존 `codex-role-unsupported` 거부를 유지한다.
반환된 역할 보고는 main loop가 실제 계획 파일에 추가하고 직접 검증·인수를 수행한다.
모든 gate는 기존 owner 웹·owner endpoint로만 결정한다. 자동 push·gate 승인·worktree 정리는 없다.

역할의 Git 메타데이터는 read-only다. child는 파일을 준비하고 handoff를 남기며,
main loop나 owner가 실제 허용 범위에서 커밋한다. 명시적 계속 요청 뒤
`dispatch --session <id> --key <key> --handoff-commit <sha>`는 준비 파일·해당 role/key·commit·열린 run을
확인해 같은 실행을 재개한다. 저장된 next 조언이나 임의 HEAD를 승인 증거로 쓰지 않는다.

## 역할과 종료

fresh App Server는 부모 대화를 재사용하지 않는다. 정책을 모델 없는 config/read로 검사하고
상속된 다른 MCP·plugin·shell 설정 값을 차단한 뒤 실제 적용된 설정을 다시 대조한다.
역할 전용 localhost bridge만 child에 공급하며 실제 HARNESS credential은 parent에 남긴다.
PM은 MCP만 사용한다. scout만 web search를 허용한다. verifier는 저장소 read-only와 검증 scratch
(qa-verifier는 자기 보고 파일 `docs/agents/qa-verifier/<KEY>.md` 쓰기도),
dev는 담당 workspace·계획·보고 파일에만 write를 허용한다. 권한 요청은 거부하고 미확인 상태는 실패로 남긴다.
설정 검사의 성공은 실제 kernel/tool 격리 검증을 대신하지 않는다.
파일 도구 preflight가 실패하면 `codex-role-execution-unavailable`로 중단한다.
이 오류는 Stagekeeper 호환성 수정 대상이며 `$harness-init` 반복이나 WSL 설치로
사용자에게 해결을 맡기지 않는다. 미확인 작업의 소유권은 기존 종료 계약대로 보존한다.

`harness-session.mjs --stop --session <id> --root <checkout>`은 token/config 없이 stopping만 기록한다.
실제 turn·child·tool 요청 종료를 확인한 후 `--release`로 반납한다. process 종료만으로 active turn의
quiescence를 주장하지 않는다. 불명확한 종료는 잠금을 보존하며 수동 복구가 필요하다.
한 common Git 디렉터리의 watch state/lock/guard를 두 client가 공유한다. 업데이트된 Claude watch는
`--start --managed`와 같은 stop/release를 사용한다. metadata 없는 legacy CLI 계약은 보존한다.
활성 legacy 작업은 먼저 실제로 중단해야 하며 다른 watch session ID를 foreground로 채택하지 않는다.

Codex의 별도 상주 실행은 `$harness-background`로 시작한다. macOS와 Windows의 native
bundle이 필요하며 시작은 사용자가 명시적으로 수행한다. macOS resident는 구현 검증과
설정된 테스트 페이지의 실제 commit 관찰 후 QA도 dispatch한다. foreground session의
자동 watch와 로그인 시 자동 시작은 다른 기능이며 macOS 로그인 자동 시작은 제공하지 않는다.

## 인수 검사

`node --import tsx scripts/rehearsals/rehearse-dual-client-runtime.ts --phase acceptance --root <준비된-별도-checkout> --report docs/test-reports/active/dual-client-runtime-report.md`
는 제품 DB와 다른 `stagekeeper_test_*`의 `TEST_DATABASE_URL`을 확인한 뒤
그 DB에만 migration과 양방향 승인 재개·원장·seed 복구 시험 6개를 실행한다.
부모의 제품·owner·API credential을 test child에 전달하지 않는다.
실제 CLI 모델 권한·브라우저·설치된 패키지 인수는 별도로 필요하며 이 명령은 모델을 호출하지 않는다.
