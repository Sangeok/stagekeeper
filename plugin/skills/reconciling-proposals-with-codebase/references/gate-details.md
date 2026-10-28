# Gate Details

Use this file when the core `SKILL.md` says to load detailed gate procedures. The gate order is mandatory; this file expands execution details only.

## Gate Loop

This is the condensed control flow; the authoritative version, with the full edit-reset and stop-condition rules, is the Canonical Execution Loop in `SKILL.md`.

1. Read the latest saved implementation source bundle and complete INV-1.
2. Select a Review Profile from `SKILL.md`. If no High-Risk trigger is currently evidenced, start with Standard and raise to High-Risk during INV-2 if a trigger appears.
3. Run INV-2 through INV-6 in order.
4. If any source document is edited, restart from step 1 with the latest saved bundle (the editing pass cannot be the final pass).
5. If no document edit is made and no unresolved blocker remains, run the Coverage Stability Check in `revalidation.md`.
6. Run INV-7 (the no-edit final pass) only after that check closes without an edit or unresolved blocker.

## INV-1 Source Bundle

- Read the proposal source fully.
- Include directly referenced detail plans, implementation plans, issues, specs, designs, command lists, snippets, schemas, fixtures, route lists, and verification instructions that the current work delegates to or depends on.
- Treat referenced snippets, command examples, schemas, config examples, path lists, and verification commands as implementation instructions when they guide the work.
- Do not chase unrelated archives or historical documents unless the latest source explicitly makes them current implementation inputs.
- If an in-scope referenced source is missing or unreadable, classify it as `blocker` or `user decision required`.

## INV-2 Concrete Inventory

- Inventory must remain exact for the selected Review Profile.
- Expand labels such as `pages`, `routes`, `messages`, `generated types`, `schemas`, `metadata`, `config`, `callbacks`, `legal docs`, and `tests` into exact files, routes, symbols, generated artifacts, commands, data/message files, config entries, and runtime hooks.
- Use `rg --files`, targeted `rg -n`, route tree inspection, schema/config inspection, generated artifact inspection, and local or primary docs when needed.
- Treat unexpanded current-scope labels as incomplete review surfaces.
- Bound the search to the current implementation source bundle and phase; do not chase unrelated surfaces.
- Expand every current-scope category label into exact surfaces for both Standard and High-Risk profiles.
- If inventory discovers behavior movement, generated/configured outputs, artifact precedence, body-level dependency ambiguity, ambiguous final body/content ownership, ambiguous verification destinations, auth/data/money/legal/compliance/migration risk, or broad category labels, raise the profile before continuing.

### Evidence-Based Not In Scope

A surface may be marked `not in scope` only after INV-2 concrete inventory shows that, within the current source bundle and current phase, it is not named, behavior-required, imported, routed, configured, generated, moved, exposed, dependency-bearing, verification-dependent, tied to preserved behavior or scope boundaries, or otherwise required for correctness, safety, final artifact validity, or verification.

Detailed dependency-bearing surfaces include schemas, data/message files, environment or config entries, callbacks, generated artifacts, runtime hooks, body-level dependencies, public exports, route consumers, and verification destinations.

Uncertain surfaces are `not verified`. `not verified` cannot support `clean pass achieved`.

### Structurally Complete Inventory Patterns

Use structural closure, not representative sampling.

- Use `rg --files` to enumerate candidate files inside the scoped source bundle.
- Use targeted `rg -n` to trace named symbols, routes, config keys, schemas, messages, generated outputs, commands, and verification destinations.
- Expand route trees, public exports, generated artifacts, config files, schema files, message/data files, and runtime hooks into exact surfaces.
- For import/export provenance, reconcile current owner -> public API export -> post-change import -> verification destination.
- For generated or configured artifacts, inspect both the source input and the produced or exposed output when available.

When a proposal moves behavior, creates or moves modules, or lists expected post-change imports/import categories, build an import/export provenance inventory:

- Extract required symbols from current imports, moved helper/function/class inventories, required behavior steps, snippets, verification commands, and expected post-change import sections.
- For each required symbol, identify the current owning module, public API export path, post-change destination file, expected import statement or import category, and verification command that proves the symbol exists at the destination.
- Treat a required symbol as incomplete inventory until this chain is reconciled.

Filesystem operation preflight for create, move, rename, and delete instructions:

- Verify sources exist for moves, renames, and deletes.
- Verify target parent directories exist or are explicitly created earlier.
- Verify targets do not collide with unrelated existing files.
- Verify imports, exports, route references, public APIs, and generated references resolve at the post-change destination.
- Require verification that checks old absence and new presence when behavior, copy, config, schema, or public API surface moves.

## INV-3 Requirement, Snippet, and Decision Audit

Map every requirement-bearing source section to one of:

- current codebase evidence
- concrete implementation task
- documented resolution in the source document
- `already satisfied`
- `non-blocking risk`
- `blocker`
- `user decision required`

Audit:

- fenced code blocks and handoff snippets
- inline signatures and APIs
- imports, relative paths, routes, commands, schemas, and config fragments
- prose/snippet conflicts
- "decide later", "TBD", "TODO", "detail plan will decide", or similar placeholders in current scope

Treat snippets as implementation surfaces when they are complete or likely to be copied. For partial or illustrative snippets, record that status and ensure they do not contradict the concrete implementation plan.

For expected post-change imports/import categories, compare the required-symbol provenance inventory against the proposal text. If a symbol is required by behavior, snippets, or verification but its owning module/public API is missing from the expected imports/import categories, classify it as a blocker. If an expected import category has no corresponding required symbol, classify it as stale or misleading unless the source documents a reason.

## INV-4 Runtime Behavior Verified

Simulate each proposed behavior or state transition, including:

- user actions and controls
- auth and authorization branches
- redirects and navigation
- callbacks, retries, refreshes, polling, direct requests, and re-entry
- transactions, async work, cancellation, cleanup, and unmount behavior
- cache, rendering, routing, persistence, and framework conventions

For new state machines or user-visible flows, answer every row of the **State Transition Table** in `references/runtime-and-artifacts.md` (the canonical copy, loaded whenever behavior is in scope per Reference Loading Rules; its scope-difference note governs). INV-4 cannot be marked complete for an in-scope state machine or user-visible flow until every row is answered; an unanswered row is `not verified` and cannot support `clean pass achieved`.

Behavior-class cues (non-exhaustive example classes, NOT a closeable checklist — structural completeness still governs per `SKILL.md` "Representative sampling is not concrete inventory"; expand every in-scope behavior, not only those named here):

- State-mutating action -> verify re-execution safety (idempotency) and partial-failure resumption (what happens if it runs twice, or resumes after a mid-way failure).
- Repeatable or concurrent action -> verify two distinct cases: (i) the SAME operation submitted twice (double-submit), and (ii) two DIFFERENT legitimate callers racing on a shared aggregate or derived invariant — a count, sum, balance, capacity, quota, or uniqueness value read then conditionally mutated (seat oversell, balance-negative, double-spend, overbook). A finding on (i) never closes (ii).
- New or moved authorization-bearing surface (a handler/endpoint/mutation reachable from an external entrypoint — route, endpoint, server action, RPC, or message handler; internal-only helpers with no external entrypoint are out of scope) -> verify the destination enforces the authorization decision (object-level ownership and default-deny), checked at the destination per INV-6 — not inferred from route, status, or config presence; or show, with positive evidence, that the surface is intentionally unauthenticated. If the authorization expectation is uncertain, default-deny: classify `not verified` (cannot support clean pass).
- Data-schema or migration change -> verify ordering relative to deploying code and any backfill (schema change vs reading/writing code vs backfill), backward/forward readability during the rollout window, reversibility / down-path, and online-vs-locking behavior. Migrations and backfills are High-Risk triggers (Review Profiles) — raise the profile, do not treat as Standard.
- Change to an existing contract/consumer (API shape, route, event, exported symbol) -> verify whether an un-migrated consumer breaks and whether the source specifies the compatibility bridge (feature flag, versioned endpoint, intermediate dual-write/expand-contract state). Rollback/forward-compatibility that affects implementation correctness is in scope here; challenging whether to ship is dev-doc-review's.
- Destructive or irreversible DATA operation (DROP column/table, mass DELETE, TRUNCATE, lossy backfill/transform) -> verify the source carries a backup/export or down-path, a point-of-no-return marker, and the data-loss blast radius (row/column scope, affected consumers). Absence of a resolved backup/down-path for an irreversible data-loss step is a blocker; a not-applicable requires positive evidence the operation is non-destructive or fully reversible. Reconciliation checks the recovery path is PRESENT and resolved in the source; whether the operation should be done is dev-doc-review's.

Mandatory obligation (the floors below are mandatory when triggered, not the complete set — structural completeness still governs every other in-scope behavior class per `SKILL.md` "Representative sampling is not concrete inventory"). These floors verify the SOURCE carries an explicit, resolved decision on each item, so implementation cannot silently omit it; proving the runtime behavior is actually correct is proposal-runtime-validator's complementary job, and is never a reason to drop a floor here.

- When INV-2 surfaces an in-scope state-mutating surface, INV-4 cannot be marked complete until re-execution-safety/idempotency, duplicate-submission, partial-failure resumption, and — when the surface reads then conditionally mutates a shared aggregate or derived invariant — distinct-caller concurrency (the resolved atomicity/isolation/locking/uniqueness-constraint decision that holds the invariant when two different callers interleave, not merely a same-caller double-submit) each have an explicit finding — or a not-applicable shown per `Evidence-Based Not In Scope`. An uncertain one is `not verified` and cannot support `clean pass achieved`.
- When INV-2 surfaces an in-scope destructive or irreversible data operation, INV-4 cannot be marked complete until backup/down-path, point-of-no-return, and blast-radius each have an explicit finding — or a not-applicable shown per `Evidence-Based Not In Scope`.

This sharpens what INV-4 runtime semantics must establish (Minimum Evidence Set item 3); it is not a new gate.

If the proposal has no behavior changes, record why INV-4 is not in scope after INV-2 confirms there are no runtime-sensitive assumptions.

## INV-5 Final Artifact Resolved

For every framework-managed, generated, configured, or convention-based output:

- identify influencing sources
- determine precedence and override behavior
- identify the final winning source/config/generated surface
- inspect produced body/content, not only route, status, headers, or config
- identify body-level dependencies such as assets, fonts, media, schemas, data, generated resources, or embedded content
- map verification to the final exposed artifact

Example: if output O can be affected by source file A, generated artifact B, and config C, and runtime precedence says C overrides A, verify the resolved body from C and its body-level dependencies.

## INV-6 Verification Destination Checked

Build or mentally maintain a verification coverage matrix that maps each implementation target to its post-change destination surface. Planned checks must inspect where the behavior, copy, config, schema, metadata, generated output, data, or runtime effect will live after implementation.

Cover:

- positive presence checks
- old absence checks after moves/removals
- public API/import updates
- negative and boundary-prohibition checks
- generated artifacts and configured outputs
- runtime behavior and final exposed body/content
- import/export provenance checks for required symbols when behavior or modules move
- authorization enforcement at any new or moved externally-reachable request-handling/mutation destination (object-level ownership + default-deny), or positively-evidenced intentionally-public; uncertain ⇒ `not verified`

Every requirement-bearing item needs verification coverage, guarded out-of-scope status, evidence-backed non-applicability, already-satisfied evidence, non-blocking risk, blocker, or user decision classification.

If two consecutive passes discover new coverage blockers after a clean-pass claim, rebuild the coverage ledger from scratch before another readiness claim.

Additional in-scope cue classes (non-exhaustive example classes, NOT a closeable checklist — structural completeness still governs per `SKILL.md` "Representative sampling is not concrete inventory"; "in scope" is decided by INV-2 Evidence-Based Not In Scope, not asserted — an un-evidenced one is `not verified` and cannot support `clean pass achieved`):

- Observability surfaces (checked under INV-5/INV-6) -> when behavior, copy, routes, or serialized shapes move or change, verify that log lines, metric/trace names, and any verification command asserting on them still fire at the post-change destination.
- Dependency / version drift (checked under INV-2/INV-3) -> when a snippet or import depends on a library/framework API, confirm the installed version (package.json / lockfile / pyproject) supports it; a path/symbol can resolve while the installed version does not provide the API. Classify a version mismatch as a blocker.
- Test-fixture / snapshot staleness (checked under INV-6) -> when a change alters a serialized shape, copy string, schema, or route, enumerate existing fixtures/snapshots/golden files encoding the old value as post-change destinations that must be updated, with old-value-absence verification.
- Secret / env var / feature-flag provenance (checked under INV-2/INV-6) -> when a snippet, config, or behavior references a secret, environment variable, or feature flag, reconcile it like a symbol: declared/seeded at its destination (`.env.example`, CI/secret store, deploy config, flag service) with the expected default for the target environment. A reference that resolves in code while the value is undefined/unseeded at the destination is a blocker.
- i18n key integrity (checked under INV-6) -> when copy moves or a translation key is added/renamed/removed, verify the key resolves in every in-scope locale catalog at its destination and that a renamed/removed key leaves no orphaned old key (old-absence verification).

### Coverage Stability Before INV-7

Run the full Coverage Stability Check in `revalidation.md` before INV-7. Tie every tested boundary to current-scope evidence, test the highest-impact or most uncertain closure through a structurally different path, and support every other plausible untested boundary with an evidence-backed exclusion. If an exclusion is unsupported, test it or raise the profile and close it there. Do not replace this check with speculative repository-wide exploration.

### High-Risk Closure Checklist

Before INV-7 for High-Risk proposals, verify:

- Every plausible current-scope risk-sensitive boundary was tested through a falsifiable closure path. Exclusions are allowed only when evidence shows the boundary is outside current scope or is not risk-sensitive.
- Every symbol, route, error key, file path, and regex/search term named in a verification command has an explicit expected outcome: allowed destination, forbidden destination, or out-of-scope reason.
- Every behavior-critical failure path has a verification destination, or the source documents why direct testing is not feasible and which later verification closes the risk.
- Every created registry, callback, hook, queue, listener, or handler has cleanup/isolation coverage when tests register mutable process-level state.
- Every removed or moved behavior has both old-absence and new-presence verification when absence is part of the requirement.
- Every accepted blocker resolution is propagated into applicable implementation steps, expected flow, verification commands, and DoD/self-review checklist.
- Every state-mutating, concurrent, or authorization-bearing behavior in scope has re-execution-safety/resumption, duplicate-submission, distinct-caller aggregate-invariant concurrency (when a shared aggregate/invariant is read-then-conditionally-mutated), or destination-level authorization coverage as applicable — treated as open obligations, not a closed list (structural completeness per `SKILL.md` still governs).

### Coverage Propagation Closure

Before any no-blocker or clean-pass claim, verify that every accepted decision, preserved behavior, unchanged surface, ordering constraint, and out-of-scope boundary is propagated to every applicable destination:

- source bundle
- concrete inventory
- filesystem preflight
- implementation steps
- runtime behavior matrix
- final artifact map
- verification plan
- scope guard
- definition of done
- reconciliation notes, only when the decision does not fit cleanly elsewhere

Missing propagation is a blocker when it could cause implementation to omit a required edit, change preserved behavior, miss a destination check, or claim completion without verifying the real post-change surface.

Apply this only to requirement-bearing sections and named current-scope surfaces. Do not mechanically require every item in every section.

### Executable Verification Command Audit

Verification commands must be valid for the target shell and project environment.

Check or rewrite commands before clean pass when they include:

- shell-sensitive quoting
- inline scripts
- JSON, YAML, schema, or generated-artifact parsing
- platform-specific paths
- command substitution, pipes, redirects, or glob behavior
- framework-generated output or build artifacts

For structured artifacts, prefer parser-backed or exact structural checks over broad text search. Broad text search may be used only as a supplementary signal.

Record every command in the Verification Command Ledger (`ledgers-and-output.md`) and execute its `local` rows as that ledger defines. Only `external` rows, or `local` rows this session is not authorized to run, stay unexecuted: document why and provide the safest executable form known for the target shell.

## INV-7 No-Edit Final Pass

After all blocker-resolution edits:

- re-open or re-scan the latest saved implementation source bundle
- run INV-1 through INV-6 again
- re-execute the Verification Command Ledger's `local` rows whose command or setup steps changed since they last ran (re-reading cannot detect a conflict between a setup step and a later command)
- make no source-document edits
- confirm no unresolved blocker remains
- assemble the Minimum Evidence Set before any ready/no-blocker claim
- after `clean pass achieved`, emit the Minimal Replay Anchor and any conditionally required Durable Receipt from `revalidation.md`

If the final pass edits a source document, status is `clean pass not completed`.

Any source-document edit invalidates an older anchor or receipt for present replay. Do not emit a replacement until a new full no-edit final pass achieves clean status.

The no-edit final pass must re-cover INV-1 through INV-6 over the full latest saved bundle; localized edits never reduce its breadth, because a blocker fix can introduce a new blocker anywhere (see SKILL.md Stop Conditions and the `examples.md` barrel re-export case). Narrowing the final pass to only the edited surfaces is forbidden.
