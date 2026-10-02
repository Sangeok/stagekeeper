---
name: init
description: Connect this repository to Stagekeeper — write harness.json, generate the agent definitions and conventions, register the MCP server once per machine, sync the roster. Use when the user says "connect to Stagekeeper" or "/harness:init".
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
  The page that issued the token shows the exact commands — point them there rather than
  composing your own. **Where the token goes depends on its kind**, below. Then stop until
  `test -n "$HARNESS_TOKEN"` passes. Never print the token value.

Two kinds of token work here. A **project token** (`hs_`) carries the project itself — one per
repository. A **user token** (`hu_`) carries only who the user is, so one token works in every
repository from one shell; the project then comes from `harness.json`'s `project.slug`.

- A **user token** (`hu_`) is saved once per machine. Tell them a history-safe way — on
  PowerShell read it into a variable first (`$t = Read-Host -AsSecureString`, convert, then
  `[Environment]::SetEnvironmentVariable(..., "User")`), on Git Bash `read -rs` then `setx`, on
  macOS or Linux edit the profile file directly rather than typing an `export` at the prompt.
  Say plainly that this stores the value as plain text in their user environment.
- A **project token** (`hs_`) belongs to one repository — keep it in the terminal that starts
  Claude Code. **Do not save it machine-wide**: `HARNESS_TOKEN` is one variable, and a second
  repository's token would overwrite this one. The environment variable lasts only in that
  terminal. In a new terminal, set the same token again from secure storage before starting
  Claude Code. The token stays valid until revoked. Save it securely to reuse it; if it was not
  saved, issue a new one and revoke the old token when no longer used. Never ask for the token
  in chat or commit it to the repository. A user token can be saved once per machine.
- **Never read the token out of a repository `.env` file**, even when one is sitting there. The
  generator and the MCP registration read the process environment only, so a run that "works"
  off `.env` stops working at the restart in step 4 — and the user is left with two tokens that
  disagree.

**A user token (`hu_`) requires both configuration and request scope.** The repository's
`harness.json` must contain `project.slug`, and every project-scoped REST or
`mcp__harness__*` request must send that value as `project`. The generator sends it for
template fetches and runbook-version reports; this skill sends it for its MCP calls.
A project token (`hs_`) still works without a slug.

If an older `hu_` configuration has no slug, recover it in step 1 before generation or
project-scoped MCP calls. Slug recovery remains optional for `hs_`.
If a valid slug is already present but a request says `project required`, inspect the
caller: it has not sent the project scope. Update the harness plugin and reload the
skill when using an older version; for a direct MCP call, include `project` explicitly.
Repeating the same unscoped request or merely rerunning an older init does not fix it.

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
       repository's default branch from git and registers the repository, **or returns the existing project
       when it is already registered** — rerunning is safe and creates nothing the second time.
       If it says the server has no `/api/projects`, that server predates this route; fall back
       to asking. Do **not** run `--register` with an `hs_` token — it answers 401 and tells you
       to use `--print-project`.

     Write a valid returned `slug` into the draft. A user token requires a verified slug
     before project-scoped requests; never invent one from the repository name. If the
     server cannot return it, obtain the exact registered identity from the owner.
     An `hs_` identity obtained through the documented legacy fallback may omit it.
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
   If `harness.json` already exists, preserve it. If `project.slug` is missing:
   - With `hu_`, recover a verified slug before generation or project-scoped MCP calls.
     Parse `origin` using the rules in the plugin's `lib/repo-url.mjs`, then compare its
     owner/repo with the configured `project.owner`/`project.repo` before running
     `--register`. Resolve any mismatch explicitly before registration; do not register
     a different repository or silently replace the configured project identity.
     Run `--register`, confirm its returned owner/repo matches the configuration, and
     require a valid returned slug. Missing or conflicting identity blocks this recovery.
   - With `hs_`, slug recovery is optional. Use `--print-project` if recovering it.
     If the server reports the documented missing `/api/project` route (404), or returns
     a matching legacy identity without a slug, preserve the configuration and continue
     omitting `project` from requests. A returned owner/repo mismatch still requires
     explicit resolution before continuing. Never invent a slug.
   - When recovery succeeds, show the proposed addition, take corrections, and add only
     `project.slug`. Preserve every other field, including workspaces, agent names,
     branch, language, knowledge, scout, and readOnly. Do not rebuild or globally replace
     the existing configuration.
   If a slug already exists, retain it; do not register or replace it merely because a
   request omitted `project`.
2. Run `node "$CLAUDE_PLUGIN_ROOT/bin/harness-init.mjs" --dry-run`. **Do not ask for the server
   URL first** — the generator resolves it in order: `--server`, then `HARNESS_SERVER`, then the
   `harness` entry in an existing `.mcp.json`. Ask for the URL from the web Tokens page only when
   it stops with `Server URL required`; a pasted value may keep its `/api/mcp` tail, which the
   generator strips. **There is still no default server URL** — without a source it stops.
   Show the files it would write **together with the draft from step 1** and take one yes for
   both. If the output has `refuse:` lines, ask whether to `--adopt` — that is the only second
   question, and a clean repository never reaches it.
   Before running, check `test -n "$HARNESS_OWNER_TOKEN"`. If it is set, the user issued an
   **owner token** on the web Tokens tab (it lets their own session open gates). Remember that
   answer for step 4 — **do not pass `--owner`**: the generator no longer writes any server, so the
   flag has no job and only prints a note saying where the owner server moved. If it is not set,
   do not ask for the token. Never print the token value.
3. Run it for real. Report the `plan:`, `write:`, `skip(modified):` and `skip(plan):` lines as
   they are. `skip(plan):` means the project's plan does not include that agent — the server did
   not send it; the user upgrades on the web and reruns. If the run stops with
   `workspace cap reached on the <plan> plan`, nothing was written: `harness.json` names more
   workspaces than the plan allows — drop some or upgrade, then rerun.
   **Keep the `server:` line from the output** — it is the resolved base URL and step 4 needs it.
   Only the generator knows it: the source order (`--server` → `HARNESS_SERVER` → an existing
   `.mcp.json`) and the tail normalization both live there. If the run also prints
   `note: that entry was also this repository's only record of the server URL`, the generator just
   removed the last per-repo copy of the address — make sure `HARNESS_SERVER` holds it (step 0
   persists it) so the next rerun does not stop with `Server URL required`.
   If identity, registration, or templates is refused with 401/403/409, stop at the reported
   error. Do not fall back to manual registration or another project; only the documented
   missing-route 404 supports legacy identity recovery. A disconnected repository requires
   explicit web reconnection. Its revoked `hs_`/`ho_` credentials need replacement; `hu_`
   remains valid. Never infer disconnection from a status code alone.
   If generation prints `stop: server access was refused after file generation`, preserve
   the files already written and stop before steps 4 and 5. Runbook reporting is best effort,
   so the generator may exit successfully despite that refusal; file generation alone does
   not establish an active connection or complete init.
4. **Register the server once per machine — you do this, do not print a command to copy.** The
   generator writes no `.mcp.json`; the server lives in the user-scope MCP config instead, so one
   registration serves every repository and **there is no per-project approval prompt**. Use the
   base URL from step 3's `server:` line.
   - Check first: `claude mcp get harness`. This is **required, not defensive** — adding a name
     that already exists fails with `already exists in user config` (exit 1) and changes nothing,
     and init is rerun routinely.
   - Absent → add it. **Single quotes around the header**, or the shell expands the variable before
     the CLI sees it and the token is written into the config as plaintext:
     `claude mcp add --transport http --scope user harness <base>/api/mcp -H 'Authorization: Bearer ${HARNESS_TOKEN}'`
   - Present but pointing at a different URL → `claude mcp remove harness -s user`, then add.
     Re-adding alone does not update it; the old address would silently stay.
   - If `HARNESS_OWNER_TOKEN` was set in step 2, register the owner server the same way:
     `harness_owner` at `<base>/api/mcp/owner` referencing `${HARNESS_OWNER_TOKEN}`. Skip it
     otherwise — a registered server with no variable just fails to connect.

   Then tell the user to **restart Claude Code**. Read `harness.json.project.slug` and
   confirm the connection with `mcp__harness__project_get({ project: slug })`.
   Only an `hs_` configuration that still has no slug may omit `project`; a `hu_`
   configuration must complete slug recovery first. Check that the returned project
   matches the configured owner/repo before continuing. If the owner server was
   registered, confirm its connection and tool availability without opening a gate.
   Skipping these checks can leave generation complete while MCP access still fails.
   **With a project token (`hs_`), say "restart from this same terminal."**
   The environment variable lasts only in that terminal. In a new terminal, set the same securely
   saved token before starting Claude Code. Restarting does not expire the token. Apply the same
   reuse and secure-storage guidance to `HARNESS_OWNER_TOKEN`, which connects only to the owner
   server. A saved user token (`hu_`) works from any terminal.
   A repository that must talk to a *different* server keeps its own `.mcp.json`: project scope
   outranks user scope, so that file stays the deliberate per-repo override.
5. Read the current `harness.json` and call `mcp__harness__project_sync` with
   `{ project: slug, workspaces, language }`, using `project.slug`, `workspaces`, and
   `language` (default `en`) from that file. Only an `hs_` configuration without a slug
   may omit `project`; never issue an unscoped call with `hu_`.
   This creates the roster on the web board, and the language determines the steps
   served by `agent_next`. Confirm the sync succeeds before declaring init complete.
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
   Commit these files on the branch you are on. They reach the default branch when this branch
   merges, and every branch cut after that has them; branches cut before it don't, as with any
   file. Do not tell the user to switch branches before committing.

The generated `.claude/agents/*.md` are **stubs**: role, tools, and the first instruction.
The step bodies stay on the server and arrive one at a time through
`mcp__harness__agent_next`. Do not try to "complete" a stub by hand.

After updating the plugin and server templates, rerun `/harness:init` to refresh the
managed runbook and stubs. The runbook must pass its configured project slug when
delegating; every stub must include that project scope in its first `agent_next` call
and subsequent MCP calls, including resume and outcome submission. Outcomes also send
the unchanged `receipt` returned by `agent_next`.

Preserve every `skip(modified):` file. Report those paths and explain that their owner
must reconcile the project-scope and receipt instructions while keeping their edits.
Do not use `--adopt` or overwrite a modified file just to force this refresh, and do not
claim skipped stubs were updated.

Not done here: creating backlog items (web, or feature-scout when the pipeline runs), gate transitions (web, or the owner's own session with an owner token, or the server where the Pipeline tab has no gate — never this skill), committing, printing the token value.

The CLI workspace-count check is only a preflight. `project_sync` also counts the union with the stored roster (omitted agents are retained); a resulting-roster cap refusal writes nothing. A workspace sync conflict asks for a retry.
