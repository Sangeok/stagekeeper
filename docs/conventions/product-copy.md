# Product copy — the English vocabulary of Stagekeeper

This is every sentence a user or an agent sees, in one place, so the whole product speaks
with one voice. Code is derived from this file, not the other way round. When a string in the
product and a string here disagree, this file wins; fix the code.

Scope: web UI, server-action errors, MCP tool descriptions, generated agent templates, the
`/harness:init` skill, generator console output. **Docs under `docs/` and code comments stay
in Korean** — that is the team's working language. Only what is *shown* is English.

Status: approved 2026-08-30 — bundle 1 (language) and bundle 2 (design v4) implemented; §5–§7 describe the v4 screens. Approved terms from `CONTEXT.md` are used as-is:
Project · Workspace · Backlog item · Board item · Gate · Agent · Validation · Evidence ·
Result · Acceptance.

---

## 1. Voice

- **Plain words.** No metaphors. Not "stamp", "desk", "briefing", "office", "approval box".
- **Buttons are verbs, states are nouns.** "Request plan" is a button; "Planning" is a state.
- **Say what happens, not what it means.** "Agents can't approve" beats "the human owns the gate".
- **Errors name the problem and the fix.** "FEAT-01 is open on the board. Finish or discard it
  before removing." Never "invalid input".
- **Sentence case.** "Request plan", not "Request Plan". Product name is "Stagekeeper".
- **No slogans, no hedging, no exclamation marks.** Empty states point at the next action.
- **The same action keeps the same name everywhere.** The button says "Request plan", the chip
  says "Plan requested", the history says "planning". No synonyms.
- Identifiers the machine made — item keys, commit hashes, paths, statuses — render in the
  monospace face. Everything a person wrote renders in the sans face.

## 2. Words we don't use

| Don't | Use instead | Why |
| --- | --- | --- |
| stamp, stamp it, stamped | approve / Request plan / Approve implementation | metaphor |
| desk, your desk, office | Team | metaphor |
| briefing | (nothing — the turn banner replaces it) | metaphor |
| approval box, inbox tray | Inbox | tab name is enough |
| reject | Send back / Put on hold / Discard | "reject" hides which of three things happened |
| harness (in UI) | Stagekeeper | "harness" is the internal protocol id (`harness.json`, `/harness:init`, `mcp__harness__*`); it stays in identifiers, not in prose |
| ticket, task, issue, row | item / board item / backlog item | `CONTEXT.md` |
| verify (as the human's act) | approve / accept | `CONTEXT.md`: validation is the agent's independent check; acceptance is the human's |
| AI, LLM, model | agent | `CONTEXT.md` |

---

## 3. States and actions

### States — six identifiers

The identifier is what the database stores, what MCP returns, and what templates reference.
The label is what the screen shows.

| Identifier | Label | Meaning |
| --- | --- | --- |
| `proposed` | Proposed | pm proposed it. Waiting for you to request a plan |
| `planning` | Planning | You requested a plan. dev is writing it |
| `in_review` | In review | The plan is submitted. Waiting for validation and your approval |
| `implementing` | Implementing | You approved. dev is changing code |
| `done` | Done | Finished and accepted |
| `on_hold` | On hold | Parked. Resume to continue |

### Human actions

| Transition | Button | Chip after success | Toast |
| --- | --- | --- | --- |
| `proposed → planning` (gate 1) | **Request plan** | Plan requested | Plan requested · FEAT-01 |
| `in_review → implementing` (gate 2) | **Approve implementation** | Approved | Implementation approved · FEAT-01 |
| `in_review → planning` | Send back | Sent back | Sent back to planning · FEAT-01 |
| `→ on_hold` | Put on hold | On hold | Put on hold · FEAT-01 |
| discard | Discard | Discarded | Discarded FEAT-01. This can't be undone. |
| `on_hold → planning` | Resume planning | — | Resumed · FEAT-01 is planning |
| `on_hold → implementing` | Resume implementation | — | Resumed · FEAT-01 is implementing |

Pending labels while the request is in flight: "Requesting…", "Approving…", "Discarding…".

**Next-step hint** (under the gate button, before you press it):

- Request plan → "dev writes a plan. Nothing changes in the code yet."
- Approve implementation → "Approving lets dev change code. Then you run dev in Claude Code."
- Approve implementation with no validation record → the button recedes from filled to outline
  and the hint turns risk-red: "This approves an unverified plan. Run plan-verifier in Claude
  Code first."

**Notes.** Send back and Put on hold take an optional note. It lands in `result` with a prefix,
so the input is capped at 150 minus the prefix:

- Send back → `Sent back: <note>` (139 chars). Field **Note to dev** (optional), hint "dev reads
  this before rewriting the plan. Up to 139 characters." Empty note → no result line.
- Put on hold → `On hold by owner (2026-08-30): <note>` (119 chars). Field **Note** (optional),
  hint "Why it's parked. Shows on the card until you resume. Up to 119 characters." Empty note →
  `On hold by owner (2026-08-30). Not discarded — still in the backlog. Resume to Planning or Implementing.`

**Resume.** The primary button goes back to where the item stopped (the `from` of the hold
event): **Resume implementation** if it was implementing, otherwise **Resume planning**. The other
target is a text link, "Resume planning instead" / "Resume implementation instead". Hint under
the buttons, by primary: implementation → "Picks up where it stopped. Resuming planning instead
clears the validation and dev rewrites the plan." · planning from proposed → "dev writes the
plan. Resuming implementation instead skips the approval gate." · planning otherwise → "dev
rewrites the plan; the validation is cleared. Resuming implementation instead skips the approval
gate."

### Agent transitions (MCP)

| Transition | Tool call |
| --- | --- |
| `planning → in_review` | `plan_submit` then `board_transition({ to: "in_review" })` |
| `implementing → done` | `report_submit` then `board_transition({ to: "done", result })` |
| `planning / implementing → on_hold` | `board_transition({ to: "on_hold", result })` |

### Validation record

`validation_record` accepts free text ≤150 chars, only in `in_review`. The main loop writes it
**only after a no-edit independent pass**. Format:

`clean pass (YYYY-MM-DD, N rounds, no edits)`

The screen judges by presence alone — if it exists, the item shows **Verified**; if not,
**No validation yet**. Writing it without a clean pass is a false pass.

---

## 4. Shell

| Where | Copy |
| --- | --- |
| `<title>` | Stagekeeper |
| meta description | Agent development pipeline with human approval gates. |
| `<html lang>` | `en` |
| App header | **Stagekeeper** / `harness-smoke` ▾ — menu: the other projects · All projects · New project. Right: GitHub login, mono |
| Project tabs | Board · Inbox · Backlog · Tokens |
| Sign-in page | Sign in with GitHub to continue. — button **Continue with GitHub**. After sign-in: `/projects` |
| Landing `/` header | **Stagekeeper** · right: **Sign in** (signed in: **Open projects**) |

## 5. Turn banner (top of every project tab)

A 2px bar at the very top of the viewport carries the turn as a color: you = `--mine`, agents =
ink, nothing or setting up = hairline. Under the header, **Board and Inbox show the full banner**;
Backlog, Tokens and item pages show a **one-line strip** with the same words.

| Owner | Headline | Detail |
| --- | --- | --- |
| you | **Waiting on you** | FEAT-01 needs a plan request / FEAT-01 is ready for your approval / FEAT-04 needs verification before approval. Several: "2 items need a plan request" · "2 plans are ready for your approval" · "2 plans need verification", joined with " · " |
| you, pm blocked | (same) | second line "pm can't propose anything new until you clear one." — strip: "… · pm is blocked until you clear one" |
| agents | **Agents are working** (with a breathing dot — the only motion in the product) | dev is writing the plan for FEAT-01 / dev is implementing FEAT-01 |
| nobody | **Nothing open** | Pick the next item from the backlog, or run pm in Claude Code to pick for you. — button **Open backlog** |
| first run | **Set up in four steps** | the checklist below |

Rules: one item → name it; several → count them. `on_hold` items never own the banner — the
banner is about who moves next, and nothing moves while on hold. An `in_review` item without a
validation record is still yours: it needs the verifier run first. Actions: **Open inbox** on
Board and in the strip when it's your turn; on Inbox the banner drops the detail line — the cards
say it.

**Next, in Claude Code** — a box under the banner with the exact line to give your session, with
**Copy**. One line per item that waits on the terminal:

- planning → `Continue the runbook for FEAT-01: step 3 — dev writes the plan.`
- in_review without validation → `Continue the runbook for FEAT-01: step 4 — verify the plan.`
- implementing → `Continue the runbook for FEAT-01: step 6 — dev implements.`

**First run** (no board rows yet) — **Set up in four steps**: 1 Token issued "Shown once when
you created the project. Issue another on the Tokens tab." (link Tokens) · 2 Connect the
repository "Open it in Claude Code with the token set, run `/harness:init`, restart, approve the
server." (chip **Not connected yet**) · 3 Add a backlog item "Key, title, area, and the evidence
— what you observed and what you confirmed in the code." (link Backlog) · 4 Run pm in Claude
Code "It picks up to two items from the backlog and puts them here for your approval." Strip:
"Setting up · Step 3 of 4 — Add a backlog item."

## 6. Board

Board is status only: (turn banner) · **Activity** · **Team**. Decision cards live on Inbox.
Activity rows link to the item page and end with the state chip.

**Activity — empty:** "No activity yet."

**Activity lines** (one per item, generated):

| State | Line |
| --- | --- |
| `proposed` | FEAT-05 · waiting for a plan request · 2 days |
| `in_review` | FEAT-04 · plan submitted · in review for 2 days |
| `planning` | FEAT-06 · writing the plan |
| `implementing` | FEAT-07 · implementing |
| `done` | FEAT-02 · *(first sentence of result, or "Done")* |
| `on_hold` | FEAT-03 · *(first sentence of result, or "On hold")* |

Day count reads "1 day" / "2 days"; omitted on day 0.

**Decision card** (Inbox only):

- Header: `FEAT-01 · README.md` (key · area, mono) — title — status line **Proposed** · pm,
  2 days ago / **In review** · dev submitted a plan 3 days ago / **On hold** · since Aug 28 · was
  Implementing. Relative time reads "today" · "1 day ago" · "N days ago".
- Gate 1 (proposed): **Evidence** row → **Request plan** + hint (§3).
- Gate 2 (in_review): plan row — **Verified** (quiet chip; tooltip = the full record) or **No
  validation yet** (risk chip; tooltip "No independent validation has been recorded. Approving
  now means implementing an unverified plan.") · path · commit — then **Read the plan ↗** ·
  **Approve implementation** + hint. **Evidence and result** collapsed.
- On hold: **Your note** row → Resume buttons (§3).
- Over-budget badge after the status line: **Over 150 characters** — tooltip "This summary is
  over 150 characters. Move the details to docs/agents/."
- Help (collapsed): **What this decision does**
  - **Request plan**: dev writes a plan. **Approve implementation**: dev changes the code.
  - **Verified** means an independent pass found nothing to change. Without it, the plan is unverified.
  - Sending back clears the validation record.
  - Discard can't be undone.
  - More in the repo: `docs/architecture/protocol.md`

**More actions** — toggle **More actions** / **Hide actions**, then a row of text actions:
Send back · Put on hold · Discard (risk). Send back and Put on hold open the note field under the
row (§3). Discard confirm: "This can't be undone. Discard FEAT-01?" — **Cancel** · **Discard**.

**Journey stepper** — not on the board since design v4. The 7-stage model (Proposed · Plan
requested · Plan · Verified · Approved · Implemented · Accepted; waiting labels pm "Selecting" ·
you "Your turn" · dev "In progress" · verifier "Verifying" · main loop "Accepting") stays in
`deriveJourney` for the item page.

**Team row** — one dense line, mono handle + state, no avatars: pm "2 awaiting your approval" /
"No new proposals" · verifier "Verifying FEAT-04" / "Idle" · dev "Awaiting review" / "Working on
FEAT-06" / "On hold" / "Recently done" / "Idle". Roles: pm "Selection" · dev "Development"
· plan-verifier "Plan verification" · doc-auditor "Doc audit" · feature-scout "Feature
scouting" · unknown "Agent" · none "Unassigned".

## 7. Inbox

- No title of its own — the turn banner is the headline. The Inbox tab carries a count badge
  while decisions are open.
- Empty: "Nothing to decide."
- Order: gate 2 (in_review) first, then gate 1 (proposed), then on_hold.
- Cards are the decision card above (§6).

## 8. Backlog

- Title **Backlog**. Toggle **Show removed** / **Hide removed**.
- Table: Key · Title · Area · Board status. Cells: state label, or "Not on board"; "Removed".
  Row action **Remove**. Empty: "No backlog items yet. Add the first one below."

- Form: **Add backlog item** / **Edit FEAT-01**. Fields **Key** (placeholder `FEAT-01`) ·
  **Title** · **Area** (placeholder `src/server/pipeline`) · **Evidence**. Evidence hint:
  "Split it in two: what you observed, and what you confirmed in the code." Buttons **Add** ·
  **Save** · "Saving…".
- Errors: "Key must look like FEAT-01: capital letters, a dash, a number." · "Title is
  required." · "FEAT-01 already exists." · "FEAT-01 doesn't exist." · "FEAT-01 is open on the
  board. Finish or discard it before removing."

## 9. Tokens

- Title **Tokens**. Intro: "Agents connect with a token. A token can't approve or edit the
  backlog — those are web only." · "MCP server URL: `http://…/api/mcp`"
- New token: label **Label** (placeholder `laptop`), button **Issue token** / "Issuing…". Error:
  "Couldn't issue the token. Try again."
- Table: Label · Issued · Status · Reference. Status "Active" / "Revoked 2026-08-30".
  Reference `token:cmte…`. Row action **Revoke**. Empty: "No tokens yet. Issue one above."


**Token reveal** (after issuing, and after creating a project):

> This is the only time the token is shown. Stagekeeper stores a hash, not the token.
>
> **1. Set it in the shell you'll open the repo from**
> It's a shell variable, not a file in the repo. The generated `.mcp.json` references
> `${HARNESS_TOKEN}`, so committing it doesn't leak the token.
> PowerShell `$env:HARNESS_TOKEN = "hs_…"` · bash / zsh `export HARNESS_TOKEN="hs_…"` — **Copy** / "Copied"
>
> **2. Open the repo from that shell and run** `/harness:init`
> MCP server URL: `http://…/api/mcp`

## 10. Projects

- List at `/projects`: title **Projects**, button **New project**. Empty: "No projects yet. Connect a
  repository to get a board, a backlog, and an inbox."
- **New project**
  - Picker: **Repository** · search placeholder "Search 20 repositories" · empty "No
    repository matches." · footnote "Private repositories aren't listed. **Paste a URL** instead."
  - Paste mode: **Repository URL** (placeholder `https://github.com/owner/repo`) · link **Pick
    from my repositories** · fallback "Couldn't load your repositories. Paste a URL." · parse
    error "That doesn't look like a GitHub repository URL. Use Edit to fill in the fields."
  - Summary line: `Sangeok/mathgic` · `master` · `/p/mathgic` — **Edit** / **Collapse** · **Start over**
  - Fields: GitHub owner · GitHub repo · Branch · URL slug (hint "Becomes /p/<slug>. Lowercase
    letters, numbers, and dashes, 2–40 characters.") · Display name (placeholder "Defaults to the slug")
  - Button **Create project** / "Creating…". Footnote: "Stagekeeper doesn't read the
    repository. It only uses the name and the default branch."
  - Success: **Project created** + token reveal + link "Open /p/mathgic"
  - Errors: "Slug must be 2–40 lowercase letters, numbers, or dashes." · "'new' is reserved." ·
    "GitHub owner and repo are required." · "'mathgic' is already taken."

## 11. Item detail

- Header: `FEAT-01` · `dev` · `README.md` — title — state chip — "Proposed 2026-08-30 01:49"
- **Evidence** · **Result** ("None yet") · **Validation** ("No validation yet")
- **Documents**: "Plan" · "dev report" · "main-loop report" — path in mono
- **History**: `01:49:14` `agent` `— → proposed` · `01:52:09` `human` `proposed → planning` ·
  discard renders as `→ discarded`

Document link labels (reused on the board): plan "Plan"; reports by actor — main-loop
"Validation record" · dev "Implementation report" · doc-auditor "Audit report" · feature-scout
"Scouting report" · other "Report".

---

## 12. Server messages

Reasons come back from `board.ts` / `board-rules.ts` to both MCP callers and web actions. They
are terse on purpose — agents parse them.

| Reason (unchanged unless noted) | Web message (`REASON_MESSAGE`) |
| --- | --- |
| `stale` | The board changed. Refresh and try again. |
| `no such backlog item (or removed)` | — |
| `already open` | — |
| `open items: 2 (max 2)` | — |
| `agent not in roster: ops` | — |
| `not allowed: agent proposed → planning` | — |
| `plan_submit first` · `report_submit first` | — |
| `cannot discard from implementing` | — |
| `validation only in in_review (now planning)` | — |
| `plan_submit only in planning (now in_review)` | — |
| `no such board item: FEAT-9` | — |

`checkText` (core): `reason: must not be empty` · `reason: must be 150 characters or fewer (got 163)`.

`harness.json` parse errors (core `config.mjs`, prefixed `harness.json <path>:`): "must be a
non-empty string" · "must be an object" · "only version 1 is supported" · "required" · "at
least one workspace" · "must start with a lowercase letter and use only lowercase letters,
digits, and dashes" · "duplicate agent: dev" · "at least one verify command" · "routine
executor needs commandIssue (an integer)" · "local | routine" · "none | verifier".

## 13. MCP tool descriptions

| Tool | Description |
| --- | --- |
| `project_get` | Project, roster, and workspaces. |
| `project_sync` | Push `harness.json.workspaces` to the service. Updates the roster. |
| `backlog_list` | Backlog items with each item's latest board status. |
| `backlog_get` | One backlog item, full evidence. |
| `board_list` | Latest board item per backlog item. `open: true` → only open ones. |
| `board_get` | Latest board item with its transition history and reports. |
| `board_propose` | pm: create a `proposed` item. Rejected when 2 items are already open, the agent isn't in the roster, the reason is over 150 characters, or the key is already open. |
| `board_transition` | Agent transitions only: planning → in_review (after plan_submit), implementing → done (after report_submit), → on_hold (result required). Gates are not here. |
| `plan_submit` | Record where the plan is (path and commit). Only in `planning`. |
| `report_submit` | Record where an actor's report is (docs/agents/<actor>/<KEY>.md, commit). |
| `validation_record` | main-loop: record a clean validation pass. Only in `in_review`, ≤150 characters. |

## 14. Generated templates (`plugin/templates/en/`)

Nine files. Same structure and the same `tools:` contract as today (the snapshot test enforces
both). Below: each file's title, its section headings, and the sentences that set the tone.

### `agents/pm.md`

- description: *Picks today's work from the backlog and asks for approval. Never reads or edits code.*
- Sections: Role (narrow — do only this) · Tools you call (nothing else) · Never · Agents you
  can assign · Daily procedure · The `area` field · States and who sets them · Output
- "You are the PM for {{project.name}}. Your only job is to decide what to work on today and
  ask for approval."
- "The board and backlog aren't files. You read and write them with tools, nothing else."
- "Two open items means no new proposal today. The server enforces the same cap — you count
  first so you can explain instead of being refused."
- "Keep the reason under 150 characters. Once written, don't change it."
- Output: "Proposed today: 1. [FEAT-01] title (agent: dev) — reason / Request the plan in the
  web inbox and dev will write it." · "N items are still open, so nothing was proposed today."

### `agents/dev.md`

- description: *Handles {{ws.path}} items: plan → your approval → implement. Never touches an unapproved item.*
- Sections: Role · What you may change · Read before you start · Never · Step 0 — pick ·
  Step A — plan (`planning`) · Step B — implement (`implementing`) · No status without proof ·
  Windows note · Output
- "Which step you're on is decided by the board status only, never by whether a plan file
  exists — otherwise an unapproved plan gets implemented."
- "Approval is approval of scope, not an exception. A plan that names files outside your
  workspace doesn't widen what you may change. Put the item on hold and stop."
- "Submit the plan before moving to in_review — the server refuses the other order."
- "Bash is read-only and verify-only. No installs, no migrations, no git reset."
- "You committed the report and the code. Then `report_submit`, then `board_transition` to
  done with a result under 150 characters. The backlog entry is removed by the server, not by you."
- Output block: `Plan: [FEAT-01] title → docs/plans/FEAT-01.md — in_review | on_hold` ·
  `Implemented: [FEAT-01] title — done | on_hold` · `{{ws.verify_result_line}}` renders as
  `Verification: node --test <result>`

### `agents/plan-verifier.md`

- description: *Verifies an in_review plan in a fresh context and reports defects with evidence. Changes nothing.*
- "You have never read or edited this plan. Your re-read is a real re-read — that is the whole
  reason you exist."
- "You don't decide. Don't write 'clean pass'. Don't touch the board."
- "A 'no defects' verdict with no per-path evidence is rejected and re-dispatched."
- Output: `Verification: FEAT-01 — 2 defects` / `— 0 defects` · `[Defect 1] <breaks
  implementation | doc hygiene>` · `[Paths run]` · `[Paths not run]`

### `agents/doc-auditor.md`

- description: *Checks whether what the docs claim about the code is still true. Reports only.*
- "Check descriptions, not rules. 'The timeout is 900 seconds' is checkable. 'Upper layers
  import only lower layers' is a rule — that's the linter's job."
- "A backlog item is, by definition, not done yet. 'The code doesn't have this' is not a
  mismatch. Mismatches are: ghosts (already done, still listed) and false claims."
- "Don't call it a mismatch without file:line. Otherwise it's a suspicion."
- Output: `Audit:` · `[Mismatches]` · `[Suspicions]` · `[Backlog — confirmed valid]` · `[Unchecked]`

### `agents/feature-scout.md`

- description: *Researches one question outside the repo and proposes with evidence. Runs when previous proposals are used up or when asked. Never touches code or the backlog.*
- "Read the repo before you search the web. The other order proposes things that already exist."
- "A proposal needs one of three: a competitor has it *and* why your users need it; users ask
  for it, with a source; it closes a hole you found, with file:line."
- "Don't rank. Give evidence and cost; the owner decides the order."
- Output: `Scouting:` · `Read:` · `Looked outside:` · `[Proposals]` · `[Not enough evidence]` · `[Couldn't check]`

### `CLAUDE.runbook.md`

- Title: `{{project.name}} — pipeline runbook`. "This is the procedure. It holds no state —
  the state lives in Stagekeeper."
- Sections: Document map · Agents · The cycle (run by the main loop) · Rules
- Cycle: 1 pm proposes · 2 **Gate 1** — you request the plan in the web inbox · 3 dev writes
  the plan, submits it, moves to in_review · 4 main loop verifies (catalog paths → independent
  pass → `validation_record` only on a clean pass) · 5 **Gate 2** — you approve implementation
  · 6 dev implements, reports, moves to done · 7 main loop accepts — **five acceptance checks**,
  reproduced by hand · 8 doc-auditor / feature-scout
- Acceptance checks: "Changed files ↔ the plan's 'Files to change'. Diff ↔ 'Implementation
  sketch'. Run the verify command yourself. Confirm the backlog entry is gone. Open the report
  the result points to."
- Rules: "Only the main loop dispatches agents. Agents never call each other." · "Commit plans,
  reports, and code. Nothing else — the board isn't in the repo." · "Only you open the gates.
  No agent and no main loop does it for you; the agent token doesn't have the tool."

### `docs/plans/README.md` · `docs/plans/template.md` · `docs/plans/verification-paths.md` · `docs/agents/README.md`

- Plan file name: `<KEY>.md`. "No dates or titles in the name — agents compute the path from the board."
- Plan sections (seven): Current behavior · Problem · Files to change · Implementation sketch ·
  Tests · Out-of-scope dependencies · Alternatives
- "Every sentence in Current behavior needs a file:line. Re-read the line right before you cite it."
- "Files to change is a contract: nothing outside it gets touched. If you need more, put the item on hold."
- verification-paths: "Nine paths. Pick by trigger, not by taste. When in doubt, include it —
  one path costs less than one round."
- agents/README: "Reports are append-only. Plans are overwritten. A plan is the current
  contract; a report is a record."

## 15. Generator, skill, plugin manifest

- `harness-init.mjs`: "Config error: harness.json version: only version 1 is supported" ·
  "Server URL required: pass --server <url> or set HARNESS_SERVER (shown on the web Tokens
  page)" · "Conflicts with existing files. Rerun with --adopt to take them over, or move them
  out of the way." · `write:` · `skip(modified):` · `refuse:` · `done: write 8 · skip 0`
- `plugin.json` description: "Connect a repository to Stagekeeper — an agent pipeline whose
  rules you set."
- `marketplace.json` description: same.
- `SKILL.md` (`/harness:init`): description "Connect this repository to Stagekeeper: write
  harness.json, generate agents and conventions, register .mcp.json, sync the roster." Steps
  keep today's seven; wording: "Ask one question at a time." · "Show the dry run and get a yes
  before writing." · "Tell the user to restart Claude Code — .mcp.json is read at session start
  — and to approve the `harness` server when `/mcp` shows Pending approval." · "Leave the
  commit to the user."

## 16. Landing — public `/` (built 2026-08-30, landing-v2)

- Headline: **Your agents build. You set the rules.** (one line each — a longer second line
  wraps to three and strands a fragment)
- Paragraph: "Your Claude Code runs plan → verify → implement → accept. Stagekeeper holds the
  state, the ledger, and the gates. Agents propose, plan, and report — they can't grant
  themselves permission."
- CTA: **Continue with GitHub** (signed in: **Open projects**). No sub-line under the CTA — `/harness:init` is taught on the token screen.
- Demo beside the thesis: a static gate-2 inbox card, caption "Your inbox when a plan is ready for you."
- "The cycle you'll run": 1 Proposed · 2 Plan requested · 3 Plan · 4 Verified · 5 Approved ·
  6 Implemented · 7 Accepted — only steps 2 and 5 carry a "you" tag; no other actor names —
  "Two of these stop for you today — 2 and 5. The rest you run in your own Claude Code."
  The section is titled for the **runbook**, not the service: only 2 and 5 are transitions the
  server enforces as human-only. 4 (validation) is recorded but not required before approval,
  and 7 (acceptance) has no status, field or tool at all — it is the five checks the owner
  reproduces by hand."
- Three facts (not slogans):
  - **Agents can't approve themselves.** Gate moves and the settings behind them are web-only.
    The agent token has neither — not by policy text, by the toolset.
  - **No pass without a record.** An item shows Verified only when an independent pass wrote
    one. Otherwise it says so.
  - **State in one place, files in yours.** The board lives in Stagekeeper. Plans and reports
    are committed next to the code, in your repository.

**Claims we don't make here, and why** (checked against the code 2026-08-30):

- Not "you approve each step" / "only you can approve" — the server enforces exactly two
  human-only transitions out of four. Gates are also planned to become a per-project setting,
  so any copy that counts them, or promises a human at every step, is written to expire.
- Not "nothing else asks for you" — the runbook has the owner dispatch agents at 1, 3, 6 and 8,
  run their own verification round at 4, and reproduce the five acceptance checks by hand at 7.
  The product's own turn banner hands you a "Next, in Claude Code" line at 3, 4 and 6.
- Not "the tool isn't registered" — `board_transition` *is* in `AGENT_TOOL_NAMES`; what stops an
  agent gate move is the rule table (`not allowed: agent proposed → planning`), plus the absence
  of any gate-only tool and of every settings tool.
- What survives a gate becoming optional: agents can't change their own permissions, no status
  claim without a record, state here and files in your repository.

---

## 17. Error pages

Uncaught failures only. Everything the product can explain — a rule violation, a stale board, a
missing item — comes back as a reason (§12) and never reaches these pages.

These are the one place §1's "errors name the problem and the fix" does not apply, and that is
deliberate: an error boundary cannot tell a failed page load from a failed action, and
`board.transition` commits before it revalidates, so it cannot know whether the write landed.
Naming a cause here would mean guessing. Say what is certain, then give the way out. Do not
"improve" these into specific sentences.

### Inbox card — `src/fsd/features/review-gate/ui/inbox-card-boundary.tsx`

One card failed; the rest of the queue stays on screen. This is the one error surface that *can*
name a cause, because reaching it means a decision was in flight on this item.

> `FEAT-01`
> The decision wasn&apos;t recorded. Try again.

Button: **Try again**

### Project tab — `src/app/(app)/p/[slug]/error.tsx`

The tab content failed; the turn banner, header and tabs survive. Still vague on purpose: the
Inbox is covered by the card boundary above, but the Backlog Remove button is not, so this page
still catches both loads and actions.

> **Something went wrong.**
> Try again. If you were approving or sending something back, open the Inbox to check whether it
> went through.

Button: **Try again**

The conditional clause is what keeps this true on every tab — it applies itself only when a
decision was in flight.

### App shell — `src/app/(app)/error.tsx`

The project layout itself failed, so the header and tabs are gone too. Give one way back.

> **Something went wrong.**
> Try again, or go back to your projects.

Button: **Try again** · link: **All projects**

---

## Review notes

Mark anything that reads wrong here; it gets fixed in this file first, then in code.

- [ ] States and buttons (§3)
- [ ] Turn banner (§5)
- [ ] Decision card, help text, More actions (§6)
- [ ] Forms and errors (§8–10)
- [ ] MCP descriptions (§13) — agents read these
- [ ] Template tone (§14)
- [x] Landing (§16) — landing-v2 approved 2026-08-30
- [ ] Error pages (§17) — added 2026-08-31 with the two boundaries
