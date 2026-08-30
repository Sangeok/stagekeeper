# plans

One plan per board item. The assigned agent writes it **before changing any code**, and
implementation starts only after the owner has read and approved it.

## File name

`<KEY>.md` — the board item's key, as is (`BUG-05.md`, `FEAT-01.md`).

No dates or titles in the name. Agents read the board and **compute** the path.

## Sections

`template.md` is the single source. Agents read it before writing a plan.

## Lifetime

There's no `active/` · `completed/` split. An item's state lives **in Stagekeeper only** — if
the file's location also encoded state, the two could disagree, and agents have no tool to move
files (`Bash` is read and verify only; there's no delete tool).

When a plan is rewritten after `on_hold`, **overwrite the same file.** Why it was blocked is
already recorded in the board's `result` (a summary under 150 characters) and in
`docs/agents/<actor>/<KEY>.md` (the detail), so the record doesn't need a second home.

A plan is **the current contract** — only one is valid, so it's overwritten. Reports under
`docs/agents/` are **accumulated records** — they're appended, never overwritten. That's why the
two folders have opposite rules.

## Connecting to the service

After writing the plan, commit it and record its location with
`mcp__harness__plan_submit({ key, path, commit })`. That record is what allows the move to
`in_review` — the server enforces the order.
