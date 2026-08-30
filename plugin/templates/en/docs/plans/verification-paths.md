# verification-paths — the catalog of plan verification paths

A table that lets **the nature of an item decide which checks must run** when its plan is
verified. These paths weren't invented — every one of them caught a defect in a real
verification round. Without the table, they live only in prose and get reinvented or forgotten
item by item.

## How to use it

1. When an item reaches `in_review`, **the main loop** picks the paths whose triggers apply,
   fixes that item's required list, and records it in `docs/agents/main-loop/<KEY>.md`.
2. The main loop's edit rounds and `plan-verifier`'s independent pass use **the same list.**
   The main loop must exhaust it before it may dispatch the independent pass, and
   `plan-verifier` receives the list in its briefing and must run all of it before it may
   report "no defects".
3. When a trigger is borderline, **include the path** — one path costs less than one round.

## Nine paths

| # | Path | Required when | What it does |
| --- | --- | --- | --- |
| 1 | Cite every citation | **every item** | Re-read every `file:line` in the plan, without exception, and compare **the content**, not just whether the line exists |
| 2 | Extract and run the sketch | the sketch contains code (in practice, every item) | Extract the code blocks **byte for byte** and compile or run them with the project's real configuration |
| 3 | Apply before/after mechanically | an existing file is modified | Does `before` match the current tree byte for byte? Does the patch apply without a hand? |
| 4 | Enumerate the complement of universals | the plan says "all / only / none / nothing" | List the other side and check. A universal without an enumeration is unverified |
| 5 | Mutation check | a decision rule or pure function is added or changed | Make the test spec executable, plant errors in the implementation, and confirm **all of them die**. A surviving mutant is a hole in the spec |
| 6 | Replay a real event | the plan interprets an external signal (API response, webhook, callback) | Run **real, recorded data** through the proposed model. Not an invented example — an actual event |
| 7 | Negative test | the plan creates or relies on a boundary, an invariant, or an allowlist | Confirm that **removing** the rule or registration makes the check actually fail. A check that passes without it is decoration |
| 8 | Render for real | a screen changes | Actually render the component and check import resolution, markup, and branches. Compiling isn't rendering |
| 9 | Inspect structured artifacts | a schema, config, or generated file changes | Parse **the structure** — nested keys, shape, precedence — rather than reading the text |

## What counts as evidence

A claim that a path ran comes with **what you ran and what came back** — the command and its
output, and the scratchpad location if you built a harness. "Checked" on its own isn't a run.
It's the same reason `plan-verifier`'s no-defects report requires per-path evidence.

## Updating this table

- **A defect caught outside the table is a defect of the table.** When a verified plan's
  implementation, acceptance, or deployment reveals a defect, append the path that would have
  caught it. This table exists because paths failed to carry over, so a repeat omission lands
  here.
- Add real cases to each row as they accumulate.
- Rows are removed only with the owner's approval. A path that hasn't run in a while means its
  trigger hasn't fired, not that the path is wrong.
