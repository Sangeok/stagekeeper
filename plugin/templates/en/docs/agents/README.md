# agents — actor reports

The board in Stagekeeper holds **state** (what is at which step). This folder holds
**activity** (who did what). A board item's evidence and result are summaries under 150
characters; all the detail comes here.

## Paths

```
docs/agents/<actor>/<KEY>.md     work tied to an item
docs/agents/<actor>/<fixed>.md   work not tied to an item
```

No dates or titles in file names. Agents read the board and **compute** the path (same rule as
`docs/plans/README.md`).

After writing a report, commit it and record its location with
`mcp__harness__report_submit({ key, actor, path, commit })`. That record is what allows the
move to `done` — the server enforces the order.

## Actors

| Actor | Holds |
| --- | --- |
| `main-loop` | Plan verification rounds, acceptance records, **gate decisions** (the owner opens the gates; the main loop records them) |
| each workspace's dev | That workspace's implementation reports |
| `doc-auditor` | Audit reports (no write tool — the main loop saves them) |
| `feature-scout` | Scouting reports (same) |

**`pm` has no folder.** Its definition forbids creating files, and its output — the reason for a
pick — fits in one line of evidence on the board.

**`plan-verifier` has no folder either.** Its report comes back as the dispatch's final message,
and the main loop folds it into the verification round log in `main-loop/<KEY>.md` — that's
already where verification records live.

**`main-loop` has no `.claude/agents/*.md` definition** — it's the dispatcher, not a subagent.
Don't apply the rule "don't list agents without a definition file" to this folder. The
exception is intentional.

## Fixed names — a closed list

Don't invent file names for work not tied to an item. There are two:

| Actor | Fixed name | Holds |
| --- | --- | --- |
| `doc-auditor` | `audit-log.md` | One audit = one section. **Record zero findings too** — "ran on this date, found nothing" is history |
| `feature-scout` | `scouting-log.md` | One scouting run = one section. The previous section is the next run's input for excluding duplicates |

Add a fixed name to this table when that kind of work actually appears. Not before.

## Append-only

**Reports are never overwritten.** New content is added as a new section.

Plans under `docs/plans/` are overwritten on rewrite, and this is the opposite, because the two
are different things — a plan is **the current contract**, so only one is valid; a report is
**an accumulated record**, so all of it is valid. A re-implementation after a hold doesn't erase
the first attempt's report.

## Folders aren't created in advance

git doesn't track empty directories. Each folder is created by **that actor's first report.**
An actor that hasn't run yet naturally has no folder — the absence is itself the information
"never run".

## Not an audit target

`doc-auditor` doesn't check this folder. Reports describe **the state at the time of writing**,
so `file:line` citations going stale over time is normal (same reason as `docs/**/completed/**`).
Only this `README.md` (the convention) is a target.
