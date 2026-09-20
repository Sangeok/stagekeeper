---
name: init
description: Connect this repository to Stagekeeper — write harness.json, generate the agent definitions and conventions, register .mcp.json, sync the roster. Use when the user says "connect to Stagekeeper" or "/harness:init".
---

# harness:init

Precondition: the user has created the project on the web and has a token. The token must be
in the `HARNESS_TOKEN` environment variable (`test -n "$HARNESS_TOKEN"`).

**Set up what is not a secret yourself; hand back only the token.**

- `HARNESS_SERVER` — **you persist it, do not print a command to copy.** Windows:
  `setx HARNESS_SERVER "<base>"`. POSIX: append `export HARNESS_SERVER="<base>"` to the login
  profile, **only if that line is not already there** — init is rerun routinely and a second
  copy is noise. The base is the web address without `/api/mcp`. Both take effect in the *next*
  shell, which is why step 4 restarts.
- `HARNESS_TOKEN` — **do not take the value into this conversation.** Open the issue page for
  them (`/settings/tokens` for a user token, `/p/<slug>/tokens` for a project token) and say
  plainly why you are not doing this part: anything pasted into the chat lands in the session
  transcript, and `setx HARNESS_TOKEN <value>` would additionally leave it in shell history.
  Tell them a history-safe way — on PowerShell read it into a variable first
  (`$t = Read-Host -AsSecureString`, convert, then `setx`), on POSIX edit the profile file
  directly rather than typing an `export` at the prompt. Then stop until
  `test -n "$HARNESS_TOKEN"` passes. Never print the token value.

Two kinds of token work here. A **project token** (`hs_`) carries the project itself — one per
repository. A **user token** (`hu_`) carries only who the user is, so one token works in every
repository from one shell; the project then comes from `harness.json`'s `project.slug`.

**Before switching an already-connected repository to a user token, rerun `/harness:init` once.**
An older `harness.json` has no `project.slug`, and a `hu_` token has nothing else to name the
project with — every call refuses with `project required: add project.slug to harness.json (rerun
/harness:init once to write it)`. Rerunning writes the slug. An `hs_` token keeps working either
way, with or without the slug.

Before creating or updating any repository files, complete the external verification-skill
preflight in [references/reconciliation-contract.md](references/reconciliation-contract.md).
The project owner supplies the approved skill package; harness does not bundle or download
it. Check the actual resolved skill and its supporting files, not just its name in a list.
If it is missing or incompatible, report the missing requirement and the installation path
from that reference, then stop before step 1. After installation, rerun this preflight.

1. If there's no `harness.json`, **do not interview the user.** Build one draft and show it once.
   - `project`: **which command depends on the token in the shell.** Check the prefix of
     `$HARNESS_TOKEN` once and pick one — they print the same five fields
     (`owner`·`repo`·`branch`·`name`·`slug`), so the rest of this step is identical either way.
     - `hs_` (**project token** — it already knows its project):
       `node "$CLAUDE_PLUGIN_ROOT/bin/harness-init.mjs" --print-project`. It writes nothing and
       needs no `harness.json`. **Do not guess the values from `git remote -v`**: the repository
       registered on the web is the truth, and the local checkout can differ. If it fails with
       `no /api/project` the server predates that route — only then fall back to asking.
     - `hu_` (**user token** — there may be no project yet):
       `node "$CLAUDE_PLUGIN_ROOT/bin/harness-init.mjs" --register`. It reads `origin` and the
       current branch from git and registers the repository, **or returns the existing project
       when it is already registered** — rerunning is safe and creates nothing the second time.
       If it says the server has no `/api/projects`, that server predates this route; fall back
       to asking. Do **not** run `--register` with an `hs_` token — it answers 401 and tells you
       to use `--print-project`.

     **Write `slug` into the draft even though it is optional**: it is the only thing a user
     token (`hu_`) has to name the project with, and a repository connected without it has to
     rerun this command before one will work.
   - `workspaces`: read `package.json` scripts and the test runner to propose `path` ·
     `<name>-dev` · verify commands. Derive `id` from the agent name (`web-dev` → `web`).
     **This is the one thing only the user knows** — agent names are the roster's unique key,
     so a wrong one leaves an orphan row on the server. Everything else you fill in.
   - Leave `knowledge`, `scout`, and `readOnly` **out of the draft and do not ask** — all three
     are optional in the schema and the generated files read correctly without them.
   - **Never write `language`.** The default (`en`) is the seeded template language; copying the
     project's stored language into `harness.json` makes the template fetch ask for a language
     that has no templates, and init fails with 404.
   - Show the finished draft once, take corrections, then write it.
2. Run `node "$CLAUDE_PLUGIN_ROOT/bin/harness-init.mjs" --dry-run`. **Do not ask for the server
   URL first** — the generator resolves it in order: `--server`, then `HARNESS_SERVER`, then the
   `harness` entry in an existing `.mcp.json`. Ask for the URL from the web Tokens page only when
   it stops with `Server URL required`; a pasted value may keep its `/api/mcp` tail, which the
   generator strips. **There is still no default server URL** — without a source it stops.
   Show the files it would write **together with the draft from step 1** and take one yes for
   both. If the output has `refuse:` lines, ask whether to `--adopt` — that is the only second
   question, and a clean repository never reaches it.
   Before running, check `test -n "$HARNESS_OWNER_TOKEN"`. If it is set, the user issued an
   **owner token** on the web Tokens tab (it lets their own session open gates): add `--owner` to
   both the dry run and the real run — the generator writes a second server, `harness_owner`,
   that references `${HARNESS_OWNER_TOKEN}`. If it is not set, do not add the flag and do not ask
   for the token. Never print the token value.
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
   failing for no reason. With `--owner`, `/mcp` also lists `harness_owner`; approve it the same
   way, and confirm `mcp__harness_owner__gate_approve` is listed. If the shell later lacks
   `HARNESS_OWNER_TOKEN`, Claude Code keeps the other servers, shows a missing-variable warning for
   `harness_owner` only, and that server fails to connect until the variable is exported again.
5. Pass `harness.json.workspaces` and `harness.json.language` (default `en`) to
   `mcp__harness__project_sync` as `{ workspaces, language }` — that's what creates the roster on
   the web board, and the language is what `agent_next` serves steps in.
6. Knowledge docs are **optional** — say so, then offer. The workspace's dev agent is told to read
   one before it writes a plan, and doc-auditor audits it right after the backlog; without one,
   every plan says the workspace has no knowledge doc instead of following conventions the user
   already has. That is a real cost, not a failure: generation succeeds either way (the template
   renders a "no knowledge doc" line). Offer to draft one now (structure, commands, pitfalls) or
   to leave it for the first plan — do not require it to finish init. If the user wants one, add
   its path to that workspace's `knowledge` and rerun init. Open a drafted doc with one line
   naming who reads it and why — whoever finds it later should not mistake it for documentation
   written for people.
7. Show `git status` and leave the commit to the user. Suggested message: `chore: connect to Stagekeeper`.
   Include the resolved verification-skill path and the owner-supplied version/commit (or the
   package checksum when it has no version). Initialization is complete only after the
   preflight and connection checks have passed; file generation alone is not completion.

The generated `.claude/agents/*.md` are **stubs**: role, tools, and the first instruction. The
step bodies stay on the server and arrive one at a time through `mcp__harness__agent_next`.
Do not try to "complete" a stub by hand. A project connected before this change reruns
`/harness:init` to switch: lock-managed files are overwritten (user-edited ones are skipped
as `skip(modified):` — tell the user those keep the old full body until they drop the edit).

Not done here: creating backlog items (web), gate transitions (web, or the owner's own session with an owner token, or the server where the Pipeline tab has no gate — never this skill), committing, printing the token value.

Receipt protocol: every agent outcome now sends the unchanged `receipt` returned by `agent_next`. Re-run init to refresh managed stubs; preserve `skip(modified)` files and explain that their owner must reconcile the receipt instructions. Never overwrite user edits.

The CLI workspace-count check is only a preflight. `project_sync` also counts the union with the stored roster (omitted agents are retained); a resulting-roster cap refusal writes nothing. A workspace sync conflict asks for a retry.
