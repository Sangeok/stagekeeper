---
name: reconciling-proposals-with-codebase
description: Use when asked to reconcile a proposal-like source — a saved proposal, plan, spec, issue, PR description, design doc, migration plan, or explicit implementation brief — against the existing codebase so it becomes a reliable, implementable source of truth (with a one-time edit-consent gate when the request was evaluation-only), or when explicitly asked whether a prior reconciliation result is still valid. It does not cover judging whether the plan should be done (dev-doc-review), pure runtime-correctness validation of proposed code (proposal-runtime-validator), ordinary codebase exploration, direct change requests, debugging, or where-to-change questions without a separate proposal-like source.
---

# Reconciling Proposals With Codebase

## Mission

Use this before implementing from a proposal-like source. The job is to make the source document a reliable implementation source of truth by reconciling it against the current codebase, runtime semantics, proposed behavior, final exposed artifacts, and verification paths.

For an explicit request about whether a prior reconciliation result is still valid, compare current bounded evidence against its recorded anchor without presenting the comparison as a new reconciliation (Loop Control: Repeat-Request Routing; `references/revalidation.md`).

Trigger boundary:

- Treat a chat message itself as the proposal-like source only when it contains a detailed implementation brief, spec, or decision-bearing plan that must be reconciled as source of truth.
- Do not use this skill for ordinary codebase investigation, impact analysis, direct implementation requests, bug reports, or questions asking what code should change.
- Fires on: "reconcile proposal.md / this migration plan against the codebase before we implement," where a separate document must become the source of truth.
- Does not fire on: "where do I add the discount logic?" or a terse one-off change request ("rename this variable," "bump the timeout to 30s") when there is no separate proposal-like artifact to reconcile.
- A numbered or multi-step message is in-scope when it is itself the implementation brief to reconcile; list shape alone never decides scope — the presence of a separate source-of-truth artifact does.

Default (governs this entire scope discussion, above and below — no trigger, sibling, routing, or non-goal statement narrows it): when it is ambiguous whether a message is a reconcilable brief, treat it as in-scope and run the full canonical loop.

Sibling-skill boundary:

- This skill answers "is the proposal an accurate source of truth against the live codebase, so implementation can proceed from it?" — it reconciles the document and edits it until implementable.
- Route here when the goal is to make the document itself correct and implementable — to edit it into the authoritative source of truth (as opposed to only judging its merits, or only checking the proposed code runs). This is an additional route-IN signal only — absence of an explicit edit-into-source-of-truth goal is never grounds to decline when a separate reconcilable artifact is present.
- Related skills key off the same proposal/doc inputs but answer different questions and are complementary, not exclusive (a typical order is reconcile → runtime-validate → implement):
  - dev-doc-review challenges whether the plan should be done (merits, scope, rollout);
  - proposal-runtime-validator checks whether the proposed code behaves correctly at runtime;
  - static/structural validators (such as doc-codebase-validator) and the doc-validation-pipeline orchestrator check a document's accuracy (paths/imports/types resolve, and in the pipeline's case runtime correctness too) but do not perform the INV-1 through INV-7 source-of-truth reconciliation.
- Checking that paths, types, and snippets resolve against the codebase is part of this skill's INV-2/INV-3 scope, so do not defer a genuine reconciliation request to a static validator.

Sibling routing: when a separate source-of-truth artifact is present, name the relevant sibling(s) rather than declining, and never absorb a sibling's job into a clean-pass claim.

Non-goal boundaries:

- Performance and scalability tuning — query-cost/N+1 optimization, hot-path latency, throughput under load — is out of scope; route those merits to dev-doc-review. Correctness under concurrent access stays IN scope as an INV-4 runtime check (see the concurrency Non-Negotiable), not a performance item.
- Self-review is this skill's floor: the no-edit final pass is run by the same agent that made the edits. For high-stakes proposals (High-Risk profile, or on user request), an independent cross-check MAY additionally be run by dispatching one independent reviewer subagent in a fresh context. Give it only the latest saved source bundle and the pass evidence (Minimum Evidence Set plus any ledgers) — never the reconciler's draft verdict or readiness claim before the subagent returns its verdict — and require an independent `PASS` / `ISSUES` verdict on the clean-pass claim with cited evidence. An `ISSUES` verdict reopens reconciliation as new blocker candidates; the cross-check never replaces INV-7 or any gate. Optional escalation, not a gate.

Do not declare a proposal ready because individual blockers were handled — readiness comes only from the Tier-0 kernel (Minimal Operating Core): one clean no-edit pass (INV-7) over the latest saved bundle.

## Minimal Operating Core

Quick reference only; on any conflict the full sections and the Non-Negotiables govern.

- **Tier-0 kernel (load-bearing restatement for context-pressure safety; never weaken):** (a) any source edit resets readiness; (b) `clean pass achieved` requires a distinct no-edit final pass (INV-7), separate from the pass that made the edit; (c) Pass State `Source changed = yes` ⇒ cannot be `clean pass achieved`. All other Non-Negotiables remain equally mandatory.
- Gates: INV-1 Source Bundle, INV-2 Concrete Inventory, INV-3 Requirement/Snippet/Decision Audit, INV-4 Runtime Behavior, INV-5 Final Artifact, INV-6 Verification Destination, INV-7 No-Edit Final Pass.
- Four stop conditions: `clean pass achieved`, `clean pass not completed`, `user decision required`, `stuck blocker`. A replay `baseline matched` may end only a qualifying comparison-only request (Loop Control: Repeat-Request Routing) and is never a canonical `Status`.
- When unsure, record `not verified` and never claim `clean pass achieved`. Review Profiles and reporting depth never reduce gate coverage (full statement: Non-Negotiables).
- Procedure: run the Canonical Execution Loop (below); detailed gate procedures in `references/gate-details.md`.

## Non-Negotiables

These are the canonical invariants; on any conflict between sections, this block wins. Restatements of the Tier-0 kernel — wherever they appear in this file or in `references/*.md` (each reference must stand alone when loaded) — are load-bearing for context-pressure safety; never weaken or de-duplicate them. Every other (non-kernel) rule is stated once, in its named home section, and referenced elsewhere by short pointers; do not reintroduce duplicates of non-kernel rules.

- Gates INV-1 through INV-7 are mandatory for every in-scope proposal — every full reconciliation, fresh audit, and implementation-readiness pass. A qualifying baseline replay is a comparison against recorded evidence, not a new reconciliation pass.
- Review Profiles classify risk and set required working-evidence depth; they never reduce gate coverage, the Minimum Evidence Set, concrete inventory, runtime checks, artifact checks, verification destination checks, propagation checks, Output Contract requirements, or no-edit final pass requirements.
- Output Depth controls user-facing reporting length only. It never shortens reconciliation, reduces working evidence, or replaces the Output Contract.
- Any source-document edit resets readiness.
- A blocker is resolved only after the relevant source document contains the accepted resolution.
- Edit Consent (one-time per source bundle): before the FIRST source-document edit, if the user's request was evaluation-only (asked to check/review/validate/evaluate, not to reconcile/fix/edit), ask once whether to apply the reconciliation edits; explicit reconcile/fix/edit requests proceed without asking. Declined ⇒ Review-only mode. Consent gates the edit action only — never trigger scope, the ambiguous=in-scope default, gate coverage, or the write-back-before-resolved rule (full mechanics: Source Document Modes).
- Clean readiness creates neither proposal-edit authority nor implementation authority. Writability alone is not authority.
- A clean pass is valid only after a no-edit final pass over the latest saved source bundle.
- Representative sampling is not concrete inventory.
- Verification must inspect post-change destination surfaces.
- Final artifact checks must inspect resolved body/content and body-level dependencies, not only route, status, header, or config presence.
- When behavior moves or expected imports/import categories are listed, required symbols must be reconciled through current owner, public API export, post-change import, and verification destination.
- Without clean pass evidence, do not say implementation can start, no blockers remain, or clean pass was achieved.
- Accepted decisions, preserved behaviors, unchanged surfaces, ordering constraints, and out-of-scope boundaries must be propagated to every applicable requirement-bearing section and verification destination.
- Missing propagation into inventory, steps, runtime matrix, final artifact map, verification plan, scope guard, or DoD is a blocker when it could cause wrong implementation or false readiness.
- Shell-sensitive, inline-script, structured-artifact, generated-output, or platform-sensitive verification commands must be executable in the target shell or rewritten to a safe executable form. Every command the source tells the implementer to run goes in the Verification Command Ledger; a `local` command counts as verified only once executed, and an unexecuted one is `not verified` (`references/ledgers-and-output.md`).
- Structured artifacts such as JSON, YAML, schemas, configs, manifests, and generated files must be checked structurally when correctness depends on nested keys, shape, or precedence.
- Replay is allowed only when the user explicitly asks whether a prior result is still valid and a usable Minimal Replay Anchor or Durable Receipt exists. Ambiguous requests to verify, review, or reconcile again require the full canonical loop.
- Replay cannot produce a canonical reconciliation `Status` or a new `clean pass achieved` claim. It may only report `baseline matched`, `drift`, or `indeterminate` before routing as defined in `references/revalidation.md`.
- If prior state, source changes, relevant bounded inventory, or a correctness-critical replay basis cannot be compared, treat replay as `indeterminate` and run the full canonical loop (the unverifiable-state rule).
- Before INV-7, run the Coverage Stability Check in `references/revalidation.md`. Every clean pass must emit a compact Minimal Replay Anchor; the anchor records applicability evidence and never proves completeness, correctness, or absence of defects.
- In addition to the anchor, emit a Durable Receipt when the reconciliation is High-Risk, crosses sessions or agents, precedes delayed implementation, or the user explicitly requests one. Keep it response-only by default; persist it only to a user-authorized or already task-authorized destination.
- For High-Risk proposals, before any clean-pass claim, run the High-Risk Closure Checklist in `references/gate-details.md`. If it is not completed, report `clean pass not completed`.
- Batch blockers: collect currently visible blocker candidates before editing, then apply one consolidated source edit; stop batching immediately on a required user decision, blocked inventory, legal/security/product ambiguity, or speculative further review (procedure and `speculative` definition: Loop Control: Batch Blocker Collection).
- Track pass state whenever the source is edited or a no-edit final pass is attempted (required fields and write-into-source criteria: Loop Control: Pass State).
- After a source edit, the default next action is a full no-edit INV-1 through INV-6 pass followed by the Coverage Stability Check and INV-7 — that no-edit pass IS INV-7 — not another exploratory edit pass or narrow spot check.
- Do not move an item out of Core when doing so changes user intent, legal posture, security posture, required behavior, or required final artifacts. Stop with `user decision required`.
- For in-scope state-mutating behavior, explicit idempotency / duplicate-submission / partial-failure findings — and, when a shared aggregate or invariant is read-then-conditionally-mutated, a distinct-caller concurrency finding (a same-caller double-submit finding does not close it) — are required before INV-7, or a not-applicable shown per Evidence-Based Not In Scope; an uncertain one is `not verified`. Lives inside INV-4 (Minimum Evidence Set item 3), not a new gate and not a ceiling for other in-scope behavior classes; full criteria: `references/gate-details.md`.
- Any new or moved authorization-bearing surface reachable from an external entrypoint must resolve its authorization at the destination (enforced-and-where, or positively-evidenced intentionally-public); uncertain ⇒ default-deny ⇒ `not verified`. Lives inside INV-4/INV-6, not a new gate.
- When an in-scope change moves or alters a serialized shape, copy string, schema, route, or log/metric/trace name, or depends on a library/framework API version, three floors each require an explicit finding before INV-7 — or a not-applicable shown per Evidence-Based Not In Scope; an uncertain one is `not verified`: (a) dependency/version drift, (b) test-fixture/snapshot/golden-file staleness encoding the old value, (c) observability destinations and any verification command asserting on them. Not a new gate; sharpens Minimum Evidence Set item 3; detailed procedures: `references/gate-details.md`.

## Canonical Execution Loop

1. If this is a repeated request, run Loop Control: Repeat-Request Routing. End with a replay result only when the request and recorded evidence qualify; otherwise continue the full loop.
2. Read the latest saved implementation source bundle and complete INV-1.
3. Select a Review Profile from the Review Profiles table. If no High-Risk trigger is currently evidenced, start with Standard and verify during INV-2.
4. Run INV-2 through INV-6 in order. Evidence-depth (brief vs full) is selected by **Evidence-depth routing** (below) after INV-2; neither the profile nor evidence-depth ever skips a gate.
5. During INV-2 through INV-6, use Loop Control: Batch Blocker Collection before editing the source document.
6. If blockers can be resolved without changing user intent or risk posture, apply one consolidated source edit (first edit of a source bundle: resolve Edit Consent first — see Source Document Modes) and propagate the resolution into every affected requirement-bearing section.
7. If any source document is edited, record Pass State and return to step 2.
8. If no edits and no unresolved blockers remain, run the Coverage Stability Check in `references/revalidation.md`, then INV-7.
9. After `clean pass achieved`, emit the Minimal Replay Anchor and any conditionally required Durable Receipt defined in `references/revalidation.md`.
10. Stop only at a replay result that is permitted to end the request (Repeat-Request Routing), or at `clean pass achieved`, `clean pass not completed`, `user decision required`, or `stuck blocker`. Terminal-vs-transient discriminator: a `clean pass not completed` caused only by a source edit in this pass is the TRANSIENT keep-looping status — step 7 already returned it to step 2, so do not halt or report it as final there. Halt at `clean pass not completed` only when it is TERMINAL: budget/time exhausted, a gate cannot be completed this turn, or review-only mode with an unresolved blocker.

**Evidence-depth routing** (after a complete INV-2). Selects working-evidence verbosity and which references to load — never gate coverage; all of INV-1 through INV-7 run on every path. Reporting depth is not an independent axis: it follows working-evidence depth.

- **Default:** full working-evidence depth + Detailed Output.
- **Brief working notes + Compact Output:** ONLY after a complete INV-2 (never brief — INV-2 establishes this) has proven every Bounded Proposal Condition. (A user may still request Detailed on brief evidence.)
- Any uncertainty, any `not verified`, or any newly-evidenced High-Risk trigger keeps you on — or returns you to — full depth for the rest of the pass; the drop is one-way and never reverses within a pass.
- On the brief path, load a reference only when a gate's trigger fires (see Reference Loading Rules); a reference being unloaded is never a reason to skip its gate.

The pass that edits a source document is never the final pass; after any edit, status stays `clean pass not completed` until INV-7 runs over the latest saved bundle (Tier-0 kernel).

## Bounded Standard Brief-Evidence Mode

A brief-evidence and compact-reporting mode, never a reduced-gate mode: every gate from INV-1 through INV-7 still runs — brief shortens evidence, never coverage. Use it only when the proposal is bounded (below), Standard-profile, no blocker has been found, and no user decision is required.

Required behavior:

1. Keep working evidence brief but concrete, with claim-to-evidence traceability for every status claim (per the Standard profile).
2. Mark runtime behavior, final artifacts, structured artifacts, or generated outputs as not in scope only after INV-2 proves they are not current-scope surfaces.
3. Use Compact Output only when all compact-output conditions hold (Output Contract).
4. The no-edit final pass for bounded, zero-blocker work is a brief confirming re-read of the (short) latest saved bundle, not a full re-derivation — but it remains a distinct no-edit pass run after the substantive pass, never merged into it, and never empty: it must still re-establish every Minimum Evidence Set item against the latest saved bundle (re-read, not recalled from memory).

### Bounded Proposal Conditions (evidence-depth qualifier)

`bounded` qualifies evidence depth and reporting length only; it never reduces any required check (canonical: Non-Negotiables). It is the proposal-level qualifier used by Bounded Standard Brief-Evidence Mode, the Standard profile's brief-working-notes allowance, and Compact Output. Do not conflate it with the separate nouns a *scoped* source bundle (how far inventory reaches — Scope Bounding / gate-details), a *self-contained* copy/UI change (a single isolated edit — `references/runtime-and-artifacts.md`), or the replay system's *bounded basis / bounded inventory* (the recorded evidence boundary of an anchor — `references/revalidation.md`).

Treat a proposal as `bounded` only when INV-1 and INV-2 establish ALL of:
1. No High-Risk trigger is currently evidenced (High-Risk escalation always dominates; the moment a trigger appears the proposal is no longer bounded).
2. Every current-scope category label was expanded into exact surfaces, with none too broad to inventory.
3. The reconciled surface set is small and fully enumerated — files, routes, symbols, commands, schemas, generated/configured artifacts, verification destinations all named, not sampled. Multiple files/routes/snippets are allowed; size alone does not disqualify. INV-2 must name the exact enumeration command(s) run (e.g., `rg --files`, route-tree inspection) and assert their result count; 'fully enumerated' is evidenced, not self-asserted.
4. No behavior movement, artifact-precedence question, ambiguous final-body/content ownership, ambiguous verification destination, or import/export provenance gap is open.
5. No blocker has been found and no user decision is required.

Brevity (brief-evidence mode, brief working notes, Compact Output) never applies to the INV-2 concrete inventory that determines bounded-ness: bounded status may be granted only after a complete INV-2 — every current-scope surface named, never sampled; a brief or partial INV-2 cannot establish it. Conservative fallback: if any condition is uncertain or `not verified`, the proposal is NOT bounded — use full working-evidence depth and Detailed Output, and re-evaluate every pass (bounded status is lost the moment any condition stops holding). A proposal that is not bounded overall may still contain an individually self-contained copy/UI change eligible for the Standard brief-evidence treatment in `references/runtime-and-artifacts.md`, provided that change has no open blocker or user decision of its own.

## Loop Control

### Repeat-Request Routing

Read `references/revalidation.md` before acting on a repeated request.

- Use replay only when the user explicitly asks whether a prior result is still valid and supplies or identifies a usable Minimal Replay Anchor or Durable Receipt.
- Treat ambiguous requests such as "verify again", "review again", or "reconcile again" as a full INV-1 through INV-7 reconciliation, not replay.
- Run the full canonical loop for a fresh audit, implementation readiness, changed scope, changed source, changed bounded inventory, unknown change state, missing anchor, unusable anchor, or contradiction with current evidence.
- Treat ANY forward-motion signal ("proceed", "let's go", "ship it", "looks good", "merge it", "go ahead", or a non-English equivalent) as implementation about to start: run the full implementation-readiness INV-1 through INV-7 pass. When in doubt, default to running it rather than relying on exact phrase recognition.
- End a comparison-only request at `baseline matched` without a canonical `Status`. State only that the historical clean result remains applicable within the recorded scope and limitations; do not claim a new clean pass.
- Treat `drift` and `indeterminate` as interim replay outcomes, automatically continue through the full canonical loop, and report only the final canonical reconciliation `Status`.
- Current contradictory evidence overrides the anchor or receipt.

### Batch Blocker Collection

Before editing an editable source document:

1. Continue the current gate sweep far enough to collect every blocker candidate visible from current evidence.
2. Group blockers by source-document resolution area: scope, inventory, runtime behavior, final artifacts, verification, DoD, or output contract.
3. Resolve compatible blockers in one consolidated edit.
4. Propagate each accepted resolution into all affected requirement-bearing sections.
5. After the edit, restart from INV-1.

Stop batching immediately when a blocker requires a user decision, blocks further inventory, creates legal/security/product ambiguity, or makes further review speculative.

Further review is `speculative` when continuing would require assuming an answer the current evidence cannot supply — including but not limited to:
(a) a later blocker candidate's correctness depends on how an already-found, not-yet-resolved blocker is settled, so any finding about it would be guessed;
(b) the unresolved blocker leaves concrete inventory, owning module, artifact precedence, or verification destination undetermined, so downstream surfaces cannot be enumerated from evidence; or
(c) continuing would force inventing product, security, data, cost, compliance, or operational intent not present in the source.

These are observable triggers, not an exhaustive list; if it is unclear whether further review has become speculative, treat it as speculative and stop to consolidate or escalate. Conversely, a candidate is speculative only when its finding cannot be determined until an earlier unresolved blocker is settled — not merely because it touches the same surface; independent blockers in the same area (for example, separate import sites of one moved symbol) stay batchable.

### Pass State

Track pass state in working notes by default. Write compact pass state into the source document only when it changes durable implementation decisions, scope, verification, final status, or future repeated-request handling.

Required fields:

```text
Reconciliation Pass State:
- Pass type: editing pass | no-edit final pass
- Source bundle reviewed:
- Source changed in this pass: yes | no
- New blockers found: yes | no
- Blockers resolved into source:
- Remaining blockers:
- User decision required: yes | no
- Next required action:
- Status:
```

Rules:

- If `Source changed in this pass` is `yes`, `Status` cannot be `clean pass achieved`.
- `Next required action` must be concrete: source edit, user decision, full no-edit final pass, or implementation can start.
- `implementation can start` may be used only when `Status` is `clean pass achieved` and the current request already grants implementation authority.

### Core / Phase Classification

When a proposal includes optional, high-risk, approval-dependent, or broad work, classify each item before implementation:

- Core: required for the current implementation.
- Phase 2: useful but not required for the current implementation.
- Approval-after: only after external approval, legal review, security review, or product decision.
- Out of scope: not part of this source bundle.

Propagate this classification into tasks, file inventory, verification, scope guards, and Definition of Done.

Do not leave optional work mixed into Core tasks if it can cause overimplementation, legal risk, final artifact confusion, or repeated reconciliation loops. Moving an item out of Core that changes intent or risk posture ⇒ stop with `user decision required` (canonical: Non-Negotiables).

## Pre-Reconciliation Classification

Optional pre-step before the mandatory loop: you may record a non-authoritative estimate (likely profile, candidate sources, likely blocker areas, next reconciliation action) to plan the first pass. It cannot narrow scope — INV-1 confirms the bundle and INV-2 the concrete inventory. Label it `Classification status: classification only, clean pass not attempted`; never use the reconciliation `Status` field, and never emit `clean pass achieved`, `no blockers remain`, `ready`, `safe to implement`, or `implementation can start`.

## Gates INV-1 Through INV-7

| ID | Gate | Must prove |
| --- | --- | --- |
| INV-1 | Source Bundle | The Proposal MD or equivalent source and every directly referenced in-scope plan, issue, spec, design, command list, snippet, schema, fixture, and verification instruction were included. |
| INV-2 | Concrete Inventory | Every current-scope label within the selected Review Profile was expanded into exact files, routes, symbols, commands, schemas, generated artifacts, data/message files, config entries, and runtime hooks. |
| INV-3 | Requirement, Snippet, and Decision Audit | Requirements, snippets, paths, signatures, commands, schemas, config fragments, prose/snippet conflicts, and placeholders map to code evidence, implementation tasks, documented resolutions, or user decisions. |
| INV-4 | Runtime Behavior Verified | User actions, state transitions, auth, redirects, callbacks, retries, direct requests, transactions, cache/rendering semantics, cleanup, and framework-sensitive assumptions are executable or evidence-backed out of scope. |
| INV-5 | Final Artifact Resolved | Every framework-managed, generated, configured, or convention-based output has a resolved winning source/config/generated surface, body/content, body-level dependencies, and verification destination. |
| INV-6 | Verification Destination Checked | Planned checks inspect where behavior, copy, config, schema, metadata, generated output, data, or runtime effects will live after implementation. |
| INV-7 | No-Edit Final Pass | After all blocker-resolution edits, the latest saved source bundle received a full no-edit pass before any ready/no-blocker claim. |

INV-7 is the no-edit final pass: re-run INV-1 through INV-6 over the latest saved bundle with zero source edits before any ready/no-blocker claim; it is counted among the mandatory gates so it can never be skipped.

For detailed gate procedures, read `references/gate-details.md`.

## Scope Bounding

Bound inventory to the current implementation source bundle and current phase. Do not chase unrelated surfaces unless the proposal names them, imports them, routes through them, configures them, generates them, or verification depends on them.

Scope bounding limits unrelated exploration, not required inventory. If a category label is too broad to inventory, classify it as a blocker until the source document narrows it.

For every create, move, rename, or delete instruction, run a filesystem preflight: verify source existence, target parent readiness, collision risk, post-change import/export destinations, and verification for both old absence and new presence when behavior moves.

## Source Document Modes

- **Editable source mode**: Use only when current proposal-edit authority exists — the request explicitly authorizes proposal edits, the current task context clearly grants proposal-edit authority, or Edit Consent (below) was given. Every accepted blocker resolution must be written back into the relevant source document before it can be marked resolved. Filesystem writability alone is insufficient.
- **Review-only mode**: Use when current proposal-edit authority is absent (including declined Edit Consent), the user forbids document edits, or the source is an issue, PR description, chat request, external spec, or other non-editable input. Run the gates but report blockers as unresolved unless the latest saved source already passes without edits.
- **Durable source mode**: If the user permits creating or updating a durable proposal document from a non-editable input, treat that document as the source of truth and apply editable source mode.

**Edit Consent (one-time, before the FIRST edit of each source bundle):**

- Proceed without asking when the user's request explicitly asked to reconcile, fix, edit, or make the document the source of truth.
- Ask once when the request was evaluation-only (e.g., "check", "review", "validate", "evaluate", "is this accurate?") and did not ask for edits: present the collected blockers, then ask whether to apply the reconciliation edits. When it is unclear whether edits were requested, ask. Consent given ⇒ editable source mode for that source bundle for the rest of the session, no further prompts; a new, distinct source document re-evaluates the gate. Consent declined ⇒ Review-only mode: run all gates and report blockers as unresolved. If the turn ends awaiting consent, report `user decision required` with `Next required action: consent to apply reconciliation edits, or Review-only mode`.
- The gate controls only the edit action. It never narrows the trigger scope or the ambiguous=in-scope default, never reduces gate coverage, and never weakens editable-source-mode's rule that accepted resolutions must be written into the source before being marked resolved — under declined consent those blockers simply remain unresolved.

Do not silently create product, security, data, cost, compliance, or operational decisions. Stop with `user decision required`.

Clean readiness does not authorize implementation. Implement only when the current request already grants implementation authority; do not ask for redundant confirmation when that authority is clear. In review-only work, stop after reporting the reconciliation result.

## Classification Rules

Use the strictest classification supported by evidence.

| Classification | Use when | Required action |
| --- | --- | --- |
| `blocker` | A mismatch, stale instruction, missing prerequisite, unsafe assumption, unverified runtime semantic, final artifact conflict, incomplete transition, verification gap, or current-scope ambiguity would likely make implementation fail, regress, or implement the wrong behavior. | Resolve from evidence and edit the source document, or stop with `user decision required` if resolution changes intent or risk posture. |
| `non-blocking risk` | The concern can be handled during implementation or verification without changing proposal intent first. | Name the risk and its verification path. |
| `refresh` | A value in the source went stale only because the repository or an external source changed after it was written, and one of these holds: the source already tells the implementer to re-check that value before the step that uses it; the value is a `path:line` citation whose cited content is unchanged at its new line; or no instruction, command, or decision the implementer follows depends on the value. | Update it in the same consolidated edit; report it under `refresh`. |
| `editorial` | A wording, ordering, or precision change that leaves every instruction, value, command, and decision the implementer follows unchanged. | Edit only to prevent misreading; report it under `editorial`. |
| `already satisfied` | Current code already satisfies the requirement and the source contains no stale instruction that would undo or contradict it. | Cite concrete evidence; edit only if stale text would mislead implementation. |
| `user decision required` | Resolution requires choosing product behavior, security posture, data policy, cost tradeoff, compliance position, or operational risk. | Stop and ask for the decision. |

Unknown runtime semantics are blockers unless the pass can show they are not required for correctness, safety, authorization, persistence, recovery, cleanup, or final artifact validity. Non-critical unknowns may be classified as non-blocking risks only with a concrete verification path.

Unresolved final artifact precedence and unexpanded current-scope category labels remain blockers until verified or narrowed out of scope by the source documents.

## Document Edit Rules

- Treat the latest saved proposal source as the source of truth.
- Confirm current proposal-edit authority before modifying it (Source Document Modes / Edit Consent); do not infer authority from writability or a prior clean result.
- Keep ledgers as working artifacts unless explicitly written into the source.
- Replace incorrect instructions; do not leave stale text and append contradictory corrections elsewhere.
- Keep the final source readable as one coherent implementation plan.
- Preserve unrelated user edits.
- Add `Reconciliation Notes` only when durable decisions do not fit cleanly in existing sections.

When a blocker is found:

1. Name the exact conflict between the source and the codebase.
2. Identify the smallest safe resolution.
3. Decide whether it preserves proposal intent.
4. If it preserves intent, edit the source with corrected approach, affected files/modules, ordering constraints, env/config/schema/migration notes, and required verification.
5. If it changes intent or risk posture, stop with `user decision required`.
6. Mark the blocker resolved only after the source contains the accepted resolution.

Any source-document edit invalidates an existing anchor or receipt for present replay. Keep the old record only as historical evidence and emit a replacement only after a new full clean pass.

## Reference Loading Rules

Use progressive disclosure, but load references when their trigger applies:

| Reference | Load when (trigger) | Covers |
| --- | --- | --- |
| `references/gate-details.md` | running full INV-1 through INV-7 procedures; snippet/command/schema audit; filesystem operation preflight | full gate procedures, audit details, filesystem preflights |
| `references/runtime-and-artifacts.md` | behavior changes, runtime state, callbacks, redirects, retries, cache/rendering semantics, framework-managed/generated/configured output, serialized/downloaded/rendered body, or final artifact precedence in scope | runtime review, state transitions, framework-sensitive assumptions, final artifact resolution |
| `references/ledgers-and-output.md` | choosing Output Depth, using brief working notes, adding pass ledgers, any blocker found, any user decision required, explicit clean-pass evidence needed, or detailed reporting requested | ledgers, Output Depth, clean-pass evidence |
| `references/common-mistakes.md` | before finalizing High-Risk proposals, after a failed clean-pass attempt, or whenever a clean-pass claim would otherwise rely on confidence rather than evidence | full mistake catalog |
| `references/examples.md` | profile selection uncertain, first-time application, or when concrete-inventory/source-edit/review-only/verification-destination/final-artifact examples would prevent ambiguity | one worked example for evidence-depth calibration; never replaces gates, inventory, or source-mode rules |
| `references/revalidation.md` | before the Coverage Stability Check, before emitting a Minimal Replay Anchor or Durable Receipt, and for every repeated request involving a prior result | Coverage Stability Check, replay routing and outcomes, Minimal Replay Anchor, Durable Receipt, authority and invalidation |

## Review Profiles

Review Profiles classify risk and set required working-evidence depth only; they never reduce any required check (canonical: Non-Negotiables). `Standard` is the default full-gate profile — not a lightweight, partial, fast, or reduced-gate mode; `High-Risk` keeps the same INV-1 through INV-7 coverage with deeper working evidence and ledgers because the proposal touches risk-sensitive behavior, artifacts, or decisions. Start with Standard when no High-Risk trigger is evidenced and verify during INV-2; record missing evidence as `not verified` (cannot support a clean-pass claim). Raise to High-Risk as soon as any trigger appears; never lower the profile during the same pass.

| Profile | Use when | Required working evidence |
| --- | --- | --- |
| Standard | Default unless a High-Risk trigger appears. Use for self-contained copy/UI changes (a single copy or UI-content edit), multiple files, routes, snippets, state transitions, verification paths, or moderate runtime/framework assumptions. | Minimum Evidence Set, requirement notes, and verification coverage notes. Working notes may be brief only while the proposal is bounded (Bounded Proposal Conditions), no blocker has been found, and no user decision is required, and must preserve claim-to-evidence traceability for every status claim. If any blocker is found, resolved, or remains, or any user decision is required, augment pass evidence with a pass ledger before any readiness claim. A pass ledger never replaces the no-edit final pass. |
| High-Risk | Authorization, data integrity, money/entitlements, legal/compliance posture, migrations/backfills, external effects, generated/configured outputs, artifact precedence, body-level dependencies, ambiguous final body/content ownership, ambiguous verification destinations, or hard-to-reverse user-visible artifacts. | Requirement, behavior, verification, final artifact, and pass ledgers. |

Representative sampling remains forbidden (canonical: Non-Negotiables).

## Minimum Evidence Set

For final responses from a full canonical reconciliation, always be able to state:

1. latest saved implementation source bundle reviewed
2. concrete implementation inventory checked
3. runtime/framework semantics checked, or why none were in scope
4. final artifact resolution map status, or why none was in scope
5. snippet/command/placeholder audit status, with the Verification Command Ledger summary (executed, `not verified`, or `external`, per command)
6. whether the final pass was a no-edit final pass
7. the Minimal Replay Anchor for a clean pass, plus a Durable Receipt when a receipt trigger applies, or why no clean pass was achieved

If any item is unknown, write `not verified` and do not claim clean pass achieved.

The Minimum Evidence Set is the canonical minimal enumeration of what must be stated. The Compact Response Shape (Output Contract) and the Clean Pass Evidence list (`references/ledgers-and-output.md`) are presentations or supersets of it; the Shape's evidence fields map one-to-one onto items 1-7 by name (the `Minimal Replay Anchor` and `Durable Receipt` fields together carry item 7), and its `Proposal source`, `Findings by class`, `Repeat guidance`, and `Status` fields are a locator, report summaries, and the stop-condition value, not evidence dimensions.

A comparison-only request that ends at `baseline matched` does not restate this set as new evidence. Use the replay output in `references/ledgers-and-output.md` and label the clean evidence as historical.

## Budget And Checkpoints

Budgets and checkpoints are reporting controls only; they never change readiness criteria. If budget or time is exhausted before INV-1 through INV-7 complete, report `Status: clean pass not completed` — exhaustion never means ready, clean enough, no blockers, safe to implement, or implementation can start.

On budget or time exhaustion, before reporting `clean pass not completed`, record a resumption checkpoint in Pass State: gates passed, surfaces inventoried, blockers still open, and the next required action. This checkpoint is an optimization for resuming work, never a readiness shortcut — on resume the unverifiable-state rule (Non-Negotiables) still applies: the full canonical loop from INV-1.

If no external budget is set, the editing-pass ceiling in Stop Conditions (default 6 editing passes without a no-edit pass) is the termination bound. Reaching it routes only to `user decision required` or `stuck blocker`, never to `clean pass achieved` or `implementation can start`. An editing pass is any pass that saved a source edit (Pass State `Source changed in this pass = yes`); a no-edit pass that discovers a blocker is not itself an editing pass but triggers the next one. The ceiling counts editing passes whether each resolves the same or a new distinct blocker, so a chain of distinct blockers (the common case per `references/examples.md`) still terminates.

## Stop Conditions

- `clean pass achieved`: the latest saved implementation source bundle was reviewed end-to-end against codebase compatibility, concrete inventory, runtime semantics, proposed behavior, final artifacts, and verification paths in a no-edit final pass, and no unresolved blocker remains.
- `clean pass not completed`: required evidence is missing, a source document changed in the latest pass, or another gate still needs verification.
- `user decision required`: a blocker cannot be resolved without choosing product behavior, security posture, data policy, cost tradeoff, compliance position, or operational risk.
- `stuck blocker`: the same unresolved blocker appears for 3 consecutive passes without new evidence or a viable resolution (where new evidence means evidence that changes the blocker's resolution path or classification — re-running a command or restating the same finding is not new evidence and does not reset the count); OR reconciliation reaches the editing-pass ceiling (default 6 editing passes) without ever achieving a no-edit pass, indicating the proposal is too unstable or underspecified to reconcile mechanically. In the ceiling case, report `user decision required` if a concrete product/scope/security/data/compliance/operational decision is identifiable to surface; otherwise report `stuck blocker` — never any ready or clean-pass claim.

`clean pass not completed` is not necessarily a failed reconciliation — see the terminal-vs-transient discriminator at Canonical Execution Loop step 9. Use it to prevent premature readiness claims.

Do not stop just because prior blockers were edited into the document. A blocker fix can introduce new blockers.

`baseline matched` may end only the qualifying comparison branch (Repeat-Request Routing). It is not a canonical stop condition or reconciliation `Status`.

## Evidence vs Report

Working evidence is what the agent must inspect or record to support reconciliation claims; user-facing output is what the agent reports back. Compact Output may shorten the report only — never the working evidence or any gate (canonical: Non-Negotiables).

## Output Contract

When the full canonical loop runs, report the Minimum Evidence Set first, then only the extra detail needed for the current request. Status must be one of: `clean pass achieved`, `clean pass not completed`, `user decision required`, or `stuck blocker`.

When a qualifying comparison-only request ends at `baseline matched`, use the replay output in `references/ledgers-and-output.md`, omit canonical `Status`, and do not present historical evidence as a new Minimum Evidence Set.

Before reporting `clean pass achieved`: run the Coverage Stability Check (`references/revalidation.md`) before INV-7, run the Section-To-Surface Coverage Ledger if any of its trigger conditions hold (see `references/ledgers-and-output.md` for the full trigger list), and for High-Risk proposals run the High-Risk Closure Checklist (`references/gate-details.md`).

Output Depth controls reporting length only (never reconciliation, working evidence, or the Output Contract — see Non-Negotiables).

Compact Output must still use the Compact Response Shape and include every Minimum Evidence Set field. It may omit detailed ledgers only when Compact conditions are satisfied: bounded proposal (see Bounded Proposal Conditions), straightforward evidence, no blocker found/resolved/remains, no user decision, and no detail requested. 'Straightforward evidence' means: zero surfaces marked `not verified`, zero High-Risk triggers, and a fully-enumerated (explicitly-listed) surface set.

Detailed Output uses the existing status-specific output plus required ledger summaries. Use Detailed Output for High-Risk profile, any blocker found/resolved/remaining, user decision, failed clean-pass attempt, repeated blocker, or requested detail.

Compact Response Shape:

```markdown
- Proposal source:
- Source bundle:
- Inventory:
- Runtime semantics:
- Final artifact map:
- Snippet/command/placeholder audit:
- Final pass:
- Minimal Replay Anchor: <required after clean pass>
- Durable Receipt: <required when a receipt trigger applies; otherwise not required>
- Findings by class:
- Repeat guidance:
- Status:
```

`Findings by class` counts this run's findings as `blocker`, `refresh`, `editorial`, `non-blocking risk`, and `user decision required` (Classification Rules) and names each `blocker` and `refresh` in one line.

`Repeat guidance`: when Status is `clean pass achieved` and the `blocker` count is 0, state in one sentence that no blocking finding was found, that repeating the same request is not needed for implementation readiness, and that later runs may surface `refresh` or `editorial` items as the repository moves; then name the steps where the source re-checks its volatile values. In every other case, write `n/a`.

For Detailed Output, also report pass count, final pass basis, surfaces checked, findings by class, repeat guidance, blockers resolved into the source, remaining non-blocking risks, user decisions required, and whether implementation can start. Implementation may start only after `clean pass achieved` and only under current implementation authority.

For repeated requests, include:

- Requested mode: prior-result validity | fresh/full reconciliation | implementation readiness
- Replay record: usable | missing | unusable
- Replay outcome, when attempted: baseline matched | drift | indeterminate
- Comparison basis and changed or uncomparable surfaces:
- Reason the request ended at comparison or continued through the full loop:
- Final canonical Status, only when the full loop ran:

## Core Mistakes To Avoid

Each of these violates a Non-Negotiable or gate above; full catalog with corrections: `references/common-mistakes.md`.

Rechecking from memory instead of re-reading the saved source; declaring clean pass after a blocker-fix edit; treating category labels or representative examples as inventory; untraced import/export provenance; checking only pre-migration locations after behavior/copy/config/schema/output moves; handler-exists-so-the-action-works; assuming the proposal instruction wins over framework/config/generated/convention surfaces; filling output templates from confidence; decisions recorded in notes but not propagated into steps/verification/scope guards/DoD; treating Keep/Out-Of-Scope/unchanged/preserved-ordering as narrative instead of verification surfaces; text-searching structured artifacts whose correctness depends on parsed shape; verification commands that fail in the target shell (quoting, path, platform) or are judged runnable by reading instead of executing; treating a historical clean result or matching replay baseline as proof of completeness, correctness, or absence of defects; using replay for an ambiguous repeat request, a fresh audit, or implementation readiness; treating repository HEAD or file status alone as sufficient identity for relevant dirty, untracked, ignored, or generated evidence; auto-running a replay recipe that can mutate state, incur cost, require privilege, expose secrets, or cause external effects; treating clean readiness or filesystem writability as proposal-edit or implementation authority.
