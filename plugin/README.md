# 로컬 클라이언트 어댑터

Claude의 `skills/`와 `.claude-plugin/plugin.json`, Codex의 `codex/skills/`와
`.codex-plugin/plugin.json`이 같은 `bin/`, `runtime/`, `lib/`를 사용한다.
portable root manifest는 두지 않는다. private 단계 본문은 패키지에 포함하지 않고
인증된 서버가 공급한다. `lib/`는 `packages/core`에서 동기화한 복사본이다.

현재 버전은 소스 기준 0.5.0이다. 실제 설치된 winning skill/helper, 모델 권한,
DB seed, 승인 이후 양방향 재개 인수는 [보고서](../docs/test-reports/active/dual-client-runtime-report.md)의
미완료 항목이다. 아래 사용법은 설치·서버·private bundle의 같은 버전을 준비한 뒤 적용한다.

제품의 기본 연결 절차는 선택한 native 클라이언트의 기존 로그인 → Stagekeeper 플러그인
설치 → 프로젝트 연결이다. WSL·다른 CLI 로그인·별도 Node·검증 스킬 설치를 사용자에게
요구하지 않는다. 현재 아래 소스 실행 절차에는 Node와 owner-provided 검증 패키지 의존성이
남아 있고 Windows 역할 파일 실행도 차단되므로 최소 설치 지원은 미완료다.
이 의존성을 패키지에서 해결하고 Windows 인수를 통과하기 전에는 일반 사용자에게
추가 설치를 안내하거나 준비 완료를 선언하지 않는다. WSL 검증은 내부 개발 기록이다.

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
독립 verifier의 `--briefing` JSON은 `requiredVerificationPaths`만 포함한다.
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
PM은 MCP만 사용한다. scout만 web search를 허용한다. verifier는 저장소 read-only와 검증 scratch,
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

Codex 자동 watch는 후속 C4이며 이 배포물의 실행 surface에 포함하지 않는다.

## 인수 검사

`node --import tsx scripts/rehearse-dual-client-runtime.ts --phase acceptance --root <준비된-별도-checkout> --report docs/test-reports/active/dual-client-runtime-report.md`
는 제품 DB와 다른 `stagekeeper_test_*`의 `TEST_DATABASE_URL`을 확인한 뒤
그 DB에만 migration과 양방향 승인 재개·원장·seed 복구 시험 6개를 실행한다.
부모의 제품·owner·API credential을 test child에 전달하지 않는다.
실제 CLI 모델 권한·브라우저·설치된 패키지 인수는 별도로 필요하며 이 명령은 모델을 호출하지 않는다.
