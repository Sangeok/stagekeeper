---
name: init
description: 이 저장소를 하니스 서비스에 연결한다 — harness.json 인터뷰, 에이전트·규약·.mcp.json 생성, project_sync. 사용자가 "하니스 연결", "/harness:init"라고 할 때.
---

# harness:init

전제: 사용자가 웹에서 프로젝트를 등록하고 토큰을 받았다. 토큰은 `HARNESS_TOKEN` 환경변수에 있어야 한다(`test -n "$HARNESS_TOKEN"` — 없으면 웹 `/p/<slug>/tokens`에서 발급하라고 안내하고 멈춘다).

1. `harness.json`이 없으면 **하나씩** 묻고 쓴다: 저장소 `owner/repo`·브랜치(`git remote -v`·`git branch --show-current`로 추정해 확인만), 워크스페이스(경로·`<이름>-dev`·검증 명령 — `package.json` scripts·러너를 읽어 후보 제시), 지식 문서 경로, `scout.question`(선택).
2. `node "$CLAUDE_PLUGIN_ROOT/bin/harness-init.mjs" --server <웹 토큰 페이지의 MCP URL에서 `/api/mcp`를 뺀 값> --dry-run`으로
   쓸 파일을 보여주고 확인받는다. **서버 URL에 기본값은 없다** — 안 넘기면 생성기가 멈춘다(`HARNESS_SERVER` 환경변수도 된다).
   `refuse:`가 있으면 `--adopt` 여부를 묻는다.
3. 실제 실행. 출력의 `write:`·`skip(modified):`를 그대로 보고한다.
4. `.mcp.json`이 생겼으니 사용자에게 **Claude Code를 재시작**하라고 안내한다(`.mcp.json`은 세션 시작 시에만 읽힌다).
   재시작 뒤 `/mcp`에서 `harness`가 `⏸ Pending approval`로 보이면 **프로젝트 스코프 MCP 서버의 1회 승인 절차**이므로
   사용자가 승인해야 한다. 거절했다면 `claude mcp reset-project-choices`로 초기화한 뒤 다시 승인한다.
   그다음 `mcp__harness__project_get`이 되는지 확인한다 — 이 단계를 빼면 `project_get`이 이유 없이 실패하는 것처럼 보인다.
5. `mcp__harness__project_sync`에 `harness.json.workspaces`를 그대로 넘긴다 — 웹 보드의 roster가 이걸로 생긴다.
6. 생성된 `.claude/agents/<ws>-dev.md`의 지식 문서가 실재하는지 확인. 없으면 초안(구조·명령·함정)을 사용자와 만든다.
7. `git status`를 보여주고 커밋은 사용자에게 맡긴다. 권장: `chore: connect to harness`.

하지 않는 것: 백로그 항목 만들기(웹에서), 게이트 전이, 커밋, 토큰 값 출력.
