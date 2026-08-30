---
name: init
description: Connect this repository to Stagekeeper — write harness.json, generate the agent definitions and conventions, register .mcp.json, sync the roster. Use when the user says "connect to Stagekeeper" or "/harness:init".
---

# harness:init

Precondition: the user has created the project on the web and has a token. The token must be
in the `HARNESS_TOKEN` environment variable (`test -n "$HARNESS_TOKEN"` — if it's missing, tell
them to issue one on the web at `/p/<slug>/tokens` and stop).

1. If there's no `harness.json`, ask **one question at a time** and write it: repository
   `owner/repo` and branch (guess from `git remote -v` and `git branch --show-current`, then
   just confirm), workspaces (path · `<name>-dev` · verify commands — read `package.json`
   scripts and the test runner to suggest candidates), knowledge doc path, `scout.question`
   (optional).
2. Run `node "$CLAUDE_PLUGIN_ROOT/bin/harness-init.mjs" --server <the MCP URL from the web
   Tokens page, minus /api/mcp> --dry-run`. Show the files it would write and get a yes before
   writing. **There is no default server URL** — without it the generator stops
   (`HARNESS_SERVER` works too). If the output has `refuse:` lines, ask whether to `--adopt`.
3. Run it for real. Report the `write:` and `skip(modified):` lines as they are.
4. `.mcp.json` now exists, so tell the user to **restart Claude Code** (`.mcp.json` is read at
   session start only). After the restart, if `/mcp` shows `harness` as `⏸ Pending approval`,
   that's the one-time approval for a project-scoped MCP server — the user has to approve it.
   If they declined, `claude mcp reset-project-choices` resets it. Then confirm
   `mcp__harness__project_get` works — skipping this step makes `project_get` look like it's
   failing for no reason.
5. Pass `harness.json.workspaces` to `mcp__harness__project_sync` as is — that's what creates
   the roster on the web board.
6. Check that the knowledge doc named in each generated `.claude/agents/<ws>-dev.md` exists.
   If it doesn't, draft one with the user (structure, commands, pitfalls).
7. Show `git status` and leave the commit to the user. Suggested message: `chore: connect to Stagekeeper`.

Not done here: creating backlog items (web), gate transitions, committing, printing the token value.
