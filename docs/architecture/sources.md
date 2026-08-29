# 원재료 — 무엇을 어디에서 가져왔나

원천: `Sangeok/ApcH @ de25a1c` (2026-08-29). 경로 열은 ApcH 저장소 상대경로다.

Stagekeeper의 규칙·템플릿·화면은 대부분 ApcH에서 실측 검증된 것을 옮겨 왔다.
이 표는 "이 파일은 어디서 왔고 오면서 무엇이 바뀌었나"의 단일 출처다. 원본을
고칠 일이 생기면 여기서 대응 관계를 먼저 확인한다.

| ApcH 경로 | 새 위치 | 변환 |
| --- | --- | --- |
| `apps/admin/src/fsd/features/transition-pipeline-gate/model/transitions.ts` | `packages/core/transitions.mjs` | 승인·반려 화이트리스트를 **행위자(human/agent) 차원**으로 확장. md 편집 로직은 버림 |
| `apps/admin/src/fsd/entities/pipeline/model/board.ts` + test | `packages/core/board-md.mjs` | 임포트 전용 |
| `apps/admin/src/fsd/features/run-pipeline-command/model/{commands,run-plan,progress}.ts` | `apps/web/src/server/pipeline/commands.ts` (P3) | 명령 본문을 roster에서 생성, 원장은 DB |
| `apps/admin/src/fsd/pages/pipeline/model/{journey,briefing,desk-commands,sprites}.ts` + `ui/**` | `apps/web/src/fsd/pages/pipeline/` | `BoardItem` 입력을 DB 행으로. 거의 무변경 |
| `apps/admin/src/fsd/features/transition-pipeline-gate/{ui,api}/**` | `apps/web/src/fsd/features/gate/` | contents API 커밋 → DB 트랜잭션. sha 낙관적 잠금 → `updatedAt` 비교 |
| `apps/admin/src/fsd/entities/{repo-doc,agent-report}/**` | `apps/web/src/fsd/entities/repo-doc/` (P4) | 계획서 본문은 GitHub raw/GitHub App으로 읽기 |
| `apps/admin/src/server/auth/{config,guard,...}` | `apps/web/src/server/auth/` | Google+`ADMIN_EMAILS` → GitHub OAuth + 프로젝트 멤버십 |
| `.claude/agents/pm.md` | `templates/ko/agents/pm.md` | 파일 읽기 → `backlog_list`·`board_list`; 보드 편집 → `board_propose`; `tools:` = MCP 3개뿐 |
| `.claude/agents/{web,admin,backend}-dev.md` | `templates/ko/agents/dev.md` | §9 매핑표. 골격/파라미터 분리(v1 §7 규칙 유지) |
| `.claude/agents/plan-verifier.md` | `templates/ko/agents/plan-verifier.md` | 브리핑에 `board_get` 허용. 무편집 규칙 그대로 |
| `.claude/agents/doc-auditor.md` | `templates/ko/agents/doc-auditor.md` | 백로그 읽기 → `backlog_list`. 보드는 여전히 보지 않음 |
| `.claude/agents/feature-scout.md` | `templates/ko/agents/feature-scout.md` | 보고만. `backlog_add`는 주지 않는다(제안은 사람이 등록) |
| `CLAUDE.md` 런북 | `templates/ko/CLAUDE.runbook.md` | 9단계 절차의 "보드 갱신·커밋"을 MCP 호출로. 문서 지도 갱신 |
| `PROJECT_BOARD.md` 안내 블록 | `docs/protocol.md` + 웹 화면 도움말 | **템플릿 아님** — 규칙은 서버 코드와 도움말로 |
| `TASK_BACKLOG.md` 머리말(관측/진단 분리 등) | 웹 백로그 편집 폼의 도움말 + `docs/protocol.md` | |
| `docs/plans/{README,template}.md`, `verification-paths.md`, `docs/agents/README.md` | `templates/ko/docs/` | 실증 산문 → `docs/rationale.md` |
| `docs/release-checks.md` + `scripts/release-verify/*` + `.claude/skills/release-verify` | P3 — `ReleaseCheck` 테이블 + `scripts/release-verify` REST 버전 | `ledger.mjs` 판정 로직은 그대로, 입출력만 REST |
| `docs/proposals/active/remote-agent-pipeline-generalization.md` | `docs/invariants.md`·`docs/rationale.md` | §3.2 표 |
