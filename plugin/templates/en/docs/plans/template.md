# <KEY>: <title>

agent: <one of {{roster_names}}>

> This file **defines the section structure of a plan** — the single source. The assigned
> agent reads it before writing a plan and follows the sections below exactly. Don't add or
> remove sections — where a section doesn't apply, write "none".
>
> To change the structure, change this one file. That's why agent docs don't carry a copy.

## Current behavior

What the code does now. **Don't write a sentence without a `file:line`.**

This section is what the owner judges the approval on. Not "the value is deducted" but
"`functions.ts:142` calls `deduct`, and the failure path doesn't call it".

Before you cite a `file:line`, **re-read that line.**

## Problem

What's wrong, in one to three sentences. **The requirement comes from the backlog item's
evidence (`source`)** — read it with `mcp__harness__backlog_get`. Don't copy the sentence, but
**rebuild the problem it points at** from the `file:line` you confirmed under Current behavior.
Don't drop the source and rewrite the problem from the code alone.

**If what the backlog points at and what you found in the code disagree, say so here.** Don't
quietly switch to the code's version — what to solve is the owner's decision.

Rewriting the problem from the title alone produces **a good plan for the wrong problem.**

## Files to change

For each file, say **what** changes. Mark new files `(new)`.

| File | Change |
| --- | --- |
| `<path>` | <what changes> |
| `<path>` `(new)` | <what it is> |

Files not listed here aren't touched during implementation. If more are needed, put the item
on hold and stop — a fresh plan beats an unapproved change.

## Implementation sketch

**What** changes is in the table above. This section says **how**, in real code. The owner
approves this section. Any decision missing here gets made alone, during implementation.

**Always in code:**

- **New pure functions, in full.** They're short, and the body is the contract. A wrong
  branch order is invisible in prose and obvious in code
- **Literal values.** Strings stored in the database, constants, identifiers. Naming them and
  leaving the value blank means the stored data gets in the way when you change it later
- **User-facing wording, in the app's actual language, verbatim.** A paraphrase gets
  reinvented at implementation time

**Changing an existing file** — write only the changed lines as before/after. Don't paste the
whole file. The `before` side follows the same rule as Current behavior: re-read the line right
before you cite it.

**Not here** — whole existing files, boilerplate like imports and type re-exports, test bodies
(the branch list under Tests is enough), markup that follows an existing pattern (point at the
pattern with `file:line`).

**This section can't be "none".** If Files to change has a single row, there's code to write.
Don't leave it empty and move to `in_review` — that's `on_hold`.

## Tests

- **Covered**: what gets pulled into pure functions and checked by the workspace's verify command
- **Not covered**: what the current runner can't check

Don't install tools. Write down honestly what isn't covered.

## Out-of-scope dependencies

**This section is for "this is where I'd be blocked", not "I'll do this too".**

If something outside your scope is needed, write that and what's needed. **Writing it here and
getting approval doesn't widen your scope.** Approval is approval of scope, not an exception.

An item with something written here goes `on_hold` the moment implementation reaches that
point. Saying so in advance is the purpose of this section — the owner can say "then don't"
before a line of code changes.

If none, write "none".

## Alternatives

If you considered other approaches, say what they were and why you didn't take them. If none,
write "none".
