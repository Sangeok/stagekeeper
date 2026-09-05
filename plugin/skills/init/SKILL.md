---
name: init
description: Connect this repository to Stagekeeper — write harness.json, generate the agent definitions and conventions, register .mcp.json, sync the roster. Use when the user says "connect to Stagekeeper" or "/harness:init".
---

# harness:init

Precondition: the user has created the project on the web and has a token. The token must be
in the `HARNESS_TOKEN` environment variable (`test -n "$HARNESS_TOKEN"` — if it's missing, tell
them to issue one on the web at `/p/<slug>/tokens` and stop).

Before creating or updating any repository files, complete the external verification-skill
preflight in [references/reconciliation-contract.md](references/reconciliation-contract.md).
The project owner supplies the approved skill package; harness does not bundle or download
it. Check the actual resolved skill and its supporting files, not just its name in a list.
If it is missing or incompatible, report the missing requirement and the installation path
from that reference, then stop before step 1. After installation, rerun this preflight.

1. If there's no `harness.json`, ask **one question at a time** and write it: repository
   `owner/repo` and branch (guess from `git remote -v` and `git branch --show-current`, then
   just confirm), workspaces (path · `<name>-dev` · verify commands — read `package.json`
   scripts and the test runner to suggest candidates), knowledge doc path, `scout.question`
   (optional).
2. Run `node "$CLAUDE_PLUGIN_ROOT/bin/harness-init.mjs" --server <the MCP URL from the web
   Tokens page, minus /api/mcp> --dry-run`. Show the files it would write and get a yes before
   writing. **There is no default server URL** — without it the generator stops
   (`HARNESS_SERVER` works too). If the output has `refuse:` lines, ask whether to `--adopt`.
3. Run it for real. Report the `plan:`, `write:`, `skip(modified):` and `skip(plan):` lines as
   they are. `skip(plan):` means the project's plan does not include that agent — the server did
   not send it; the user upgrades on the web and reruns. If the run stops with
   `workspace cap reached on the <plan> plan`, nothing was written: `harness.json` names more
   workspaces than the plan allows — drop some or upgrade, then rerun.
4. `.mcp.json` now exists, so tell the user to **restart Claude Code** (`.mcp.json` is read at
   session start only). After the restart, if `/mcp` shows `harness` as `⏸ Pending approval`,
   that's the one-time approval for a project-scoped MCP server — the user has to approve it.
   If they declined, `claude mcp reset-project-choices` resets it. Then confirm
   `mcp__harness__project_get` works — skipping this step makes `project_get` look like it's
   failing for no reason.
5. Pass `harness.json.workspaces` and `harness.json.language` (default `en`) to
   `mcp__harness__project_sync` as `{ workspaces, language }` — that's what creates the roster on
   the web board, and the language is what `agent_next` serves steps in.
6. Check that the knowledge doc named in each generated `.claude/agents/<ws>-dev.md` exists.
   If it doesn't, draft one with the user (structure, commands, pitfalls).
7. Show `git status` and leave the commit to the user. Suggested message: `chore: connect to Stagekeeper`.
   Include the resolved verification-skill path and the owner-supplied version/commit (or the
   package checksum when it has no version). Initialization is complete only after the
   preflight and connection checks have passed; file generation alone is not completion.

The generated `.claude/agents/*.md` are **stubs**: role, tools, and the first instruction. The
step bodies stay on the server and arrive one at a time through `mcp__harness__agent_next`.
Do not try to "complete" a stub by hand. A project connected before this change reruns
`/harness:init` to switch: lock-managed files are overwritten (user-edited ones are skipped
as `skip(modified):` — tell the user those keep the old full body until they drop the edit).

Not done here: creating backlog items (web), gate transitions, committing, printing the token value.
