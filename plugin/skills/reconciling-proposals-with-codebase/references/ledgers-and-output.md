# Ledgers and Output

Use ledgers as working artifacts while reconciling. Do not automatically insert them into the proposal source. The source should contain the final coherent implementation plan, not every scratch note.

## Review Profile Ledger Requirements

| Profile | Ledger requirement |
| --- | --- |
| Standard | Minimum Evidence Set, requirement notes, and verification coverage notes. Working notes may be brief only while the proposal is bounded (proposal-level qualifier; see SKILL.md Bounded Proposal Conditions), no blocker has been found, and no user decision is required. Brief working notes must preserve claim-to-evidence traceability for every status claim. If any blocker is found, resolved, or remains, or any user decision is required, augment pass evidence with a pass ledger before any readiness claim. A pass ledger never replaces the no-edit final pass. |
| High-Risk | Requirement, behavior, verification, final artifact, and pass ledgers. |

Review Profiles classify risk and set required working-evidence depth. They never reduce gate coverage, the Minimum Evidence Set, or any other required check (canonical statement: SKILL.md Non-Negotiables).

## Output Depth

Output Depth controls reporting length only; it never shortens reconciliation, reduces working evidence, or replaces the Output Contract. Compact Output still uses the Compact Response Shape with every Minimum Evidence Set field. For the full Compact conditions (including no-blocker / no-user-decision), see the Output Contract section in `SKILL.md` — canonical.

Detailed Output uses the existing status-specific output plus required ledger summaries. Use Detailed Output for High-Risk profile, any blocker found/resolved/remaining, user decision, failed clean-pass attempt, repeated blocker, or requested detail.

## Requirement Ledger

| Requirement | Source | Code Evidence | Finding | Classification | Required Source Change | Verification |
| --- | --- | --- | --- | --- | --- | --- |

## Behavior Ledger

| Proposed Behavior | Trigger/User Action | Starting State/Data | Runtime Semantics Checked | Expected Transition | Edge/Terminal States | Finding | Classification | Required Source Change | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Verification Coverage Matrix

| Implementation Target | Source Instruction | Post-Change Surface | Verification Coverage | Status |
| --- | --- | --- | --- | --- |

For High-Risk proposals, include verification-command terms as rows when a command searches multiple symbols or patterns. Each term must have an expected post-change classification: allowed destination, forbidden destination, or out-of-scope reason.

## Verification Command Ledger

Required whenever the source bundle tells the implementer to run commands (setup, verification, rollout). One row per command, in source order.

| Command (source step) | Class | Prerequisites the source provides | Executed | Result |
| --- | --- | --- | --- | --- |

- `Class` is `local` when the command can run in an isolated workspace without writing shared or production state, needing production credentials, or causing external effects (push, deploy, paid API). Everything else is `external`.
- Execute every `local` row on the current baseline code, in the environment the source's own setup steps create (a fresh worktree or equivalent when the working tree is not clean), before applying the proposed change. This proves the command and its prerequisites work as written. Whether the changed code passes is proposal-runtime-validator's job. When the expected result exists only after the change (a new-presence search, a test file the change adds), record that the command ran and its baseline output.
- Reading a command is not executing it. A `local` row that was not executed, or whose prerequisites the source does not say how to obtain, is `not verified` and blocks `clean pass achieved`. If this session is not authorized to run it, say so; it stays `not verified`.
- `external` rows are checked for shape and target shell only, never executed, and are reported as remaining risk.
- After a source edit that changes a command or a setup step it depends on, re-execute the affected `local` rows; earlier results do not carry over.

## Section-To-Surface Coverage Ledger

Use this before any clean-pass claim. Cover objective, implementation inventory, create/move/modify/keep instructions, implementation steps, expected post-change requirements, verification, runtime behavior checks, documentation workflow, definition of done, out-of-scope sections, and directly referenced in-scope sources when present.
Run this ledger before INV-7 whenever the pass edited the source document, resolved a blocker, added a preserved behavior, added an unchanged surface, changed verification commands, or narrowed scope.

Each requirement-bearing section must map to at least one of:

- current code evidence
- implementation step
- runtime behavior check
- final artifact destination
- verification command
- scope guard
- definition of done item
- documented out-of-scope evidence
- user decision required

The ledger is a working artifact by default. Insert it into the source document only when the source needs durable traceability or when the user explicitly asks for it.

| Source Section | Requirement / Symbol / Surface | Current Evidence | Post-Change Destination | Verification / Guard / Classification | Status |
| --- | --- | --- | --- | --- | --- |

## Final Artifact Resolution Map

| Final Artifact | Influencing Sources | Precedence Basis | Final Body/Content | Body-Level Dependencies | Verification Destination |
| --- | --- | --- | --- | --- | --- |

## Pass Ledger

| Pass | Input Source Basis | New or Repeated Blockers | Source Changes Saved | Remaining Status | Next Action |
| --- | --- | --- | --- | --- | --- |

## Clean Pass Evidence

Before saying implementation can start, a clean pass was achieved, or no blockers remain, assemble:

- latest saved implementation source bundle reviewed
- number of passes and input basis for the final pass
- confirmation that the final pass was a no-edit final pass, or a statement that clean pass was not achieved
- concrete implementation inventory checked, including how category labels were expanded
- codebase surfaces checked, with concrete paths, symbols, commands, or observed outputs
- runtime/framework semantics checked, with local or primary documentation evidence when relevant
- final artifact resolution map status for framework-managed, generated, configured, or convention-based outputs in scope, or why none are in scope
- snippet/example/command audit status, with the Verification Command Ledger
- unresolved placeholder scan status
- blockers resolved into the source documents during the current turn
- remaining non-blocking risks and verification path, or an explicit statement that none remain
- Coverage Stability Check basis, the Minimal Replay Anchor when status is `clean pass achieved`, and a Durable Receipt when a receipt trigger applies

If this evidence cannot be named, report `clean pass not completed`.

## Compact Response Shape

Use the canonical Compact Response Shape defined in `SKILL.md` (Output Contract). `Status` must be one of: `clean pass achieved`, `clean pass not completed`, `user decision required`, or `stuck blocker`.

## Status-Specific Output

```markdown
Status: clean pass achieved
- Final pass basis:
- No-edit final pass:
- Evidence: bundle, inventory, runtime, artifact map, snippet/placeholder audit, verification destination
- Remaining non-blocking risks:
- Findings by class: <blocker / refresh / editorial / non-blocking risk / user decision required counts; name each blocker and refresh>
- Repeat guidance: <defined in SKILL.md Output Contract>
- Minimal Replay Anchor: <compact anchor from revalidation.md>
- Durable Receipt: <extension from revalidation.md when triggered; response-only by default, or authorized destination>
```

```markdown
Status: clean pass not completed
- Reviewed so far:
- Missing gate or evidence:
- Why no ready/no-blocker claim is allowed:
- Next reconciliation action:
```

```markdown
Status: user decision required
- Blocking decision:
- Why this changes product behavior, security posture, data policy, cost, compliance, or operational risk:
- Options or decision needed:
- Source document section affected:
```

```markdown
Status: stuck blocker
- Repeated blocker:
- Passes where it repeated:
- Evidence gathered:
- Why no viable resolution remains without new input or external-state change:
```

Every field must be backed by evidence. If a field is unknown, write `not verified` and do not claim clean pass achieved.

## Repeated-Request Output

Read `revalidation.md` before reporting on a prior result.

For a comparison-only request that ends at a matched baseline, do not emit a canonical reconciliation `Status`:

```markdown
Replay outcome: baseline matched
- Recorded scope and basis compared:
- Safe recipes replayed:
- Manifest-only evidence compared:
- Volatile evidence and limitation:
- Historical result: clean pass achieved remains applicable within the recorded scope
- Limitation: this is not a new clean pass and does not prove completeness, correctness, or absence of defects
```

For `drift` or `indeterminate`, treat the replay outcome as routing evidence, automatically run the full canonical loop, and use the applicable status-specific output above. Name the interim replay outcome and routing reason, but do not use it as the final `Status`.

## Detailed Reports

For blocker, High-Risk Review Profile, or user-requested detailed responses, include:

- number of passes completed
- final pass basis
- codebase surfaces checked
- runtime/framework semantics checked
- final artifact resolution map status
- snippet/example/command audit status, with the Verification Command Ledger
- placeholder scan status
- whether the final pass edited any source document
- blockers resolved into the source
- user decisions required
- non-blocking risks and verification notes
- behavior/runtime pass summary
- whether implementation can start now under current implementation authority
- Coverage Stability Check summary, Minimal Replay Anchor when clean status was achieved, and Durable Receipt when triggered
