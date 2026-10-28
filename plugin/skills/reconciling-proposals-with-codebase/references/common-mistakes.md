# Common Mistakes

Use this before finalizing High-Risk Review Profile proposals, after failed clean-pass attempts, or whenever a ready/no-blocker claim might rely on confidence rather than evidence.

| Mistake | Correction |
| --- | --- |
| Rechecking from memory after fixing a blocker | Re-read the latest saved source bundle and run the next pass from that text. |
| Reusing prior pass coverage after editing the proposal | Discard stale coverage notes and rebuild section-to-surface coverage from the latest saved source bundle before any clean-pass claim. |
| Declaring clean pass after a blocker-fix edit | Run a no-edit final pass over the latest saved bundle; clean pass is invalid if the last pass changed the source. |
| Reporting completion after editing the proposal | Any source-document edit resets readiness; rerun INV-1 through INV-6 over the latest saved bundle with no edits before claiming clean pass. |
| Treating category labels as complete coverage | Expand each category into exact files, routes, symbols, generated artifacts, config, message/data files, commands, and runtime hooks. |
| Verifying that a required symbol appears in behavior checks but not tracing its import/export provenance | Build a symbol-to-import provenance matrix. A required symbol is not reconciled until its current owner, public API export, post-change import or import category, and verification destination all match. |
| Validating a move or rename only as architecture direction | Verify source existence, target parent readiness, collision risk, post-change import/export destinations, and old-absence/new-presence verification. |
| Forcing full ledgers and long reports for every task | Use the selected Review Profile for ledger requirements; never scale down gate coverage or Minimum Evidence Set. |
| Treating every concern as a blocker | Reserve blocker for issues that can break implementation, regress behavior, or change meaning. |
| Appending fixes that contradict earlier sections | Replace stale sections so the source has one coherent implementation path. |
| Ending after blocker fixes | Run one full no-edit pass against the latest saved implementation source bundle. |
| Choosing product-impacting behavior silently | Stop with `user decision required`. |
| Reporting no problems while risks remain | Label risks as non-blocking and attach verification paths. |
| Only checking current-code compatibility | Also simulate the new behavior the proposal introduces against runtime/framework semantics. |
| Validating only the entry source when it delegates implementation to another plan/spec | Build and review the full implementation source bundle. |
| Treating code snippets as illustrative when implementation will copy them | Audit snippets, paths, imports, commands, schemas, and config fragments as implementation surfaces. |
| Treating handoff snippets as harmless examples | Decide whether handoff snippets are complete, partial, or illustrative; audit compile/execution completeness for exact post-change surfaces. |
| Letting correct prose coexist with stale code examples | Treat prose/snippet conflicts as blockers and edit the source until only one coherent path remains. |
| Ignoring "decide later" text in current scope | Classify unresolved implementation decisions as blockers or user decisions unless explicitly out of scope. |
| Checking only original source locations after migration | Trace the post-change destination artifact and require verification over that final surface. |
| Verifying only the new destination after a move | Verify new presence, old absence, and public API/import updates when movement is in scope. |
| Leaving prohibitions as prose | Add concrete negative checks for prohibited imports, exports, files, config entries, or generated artifacts. |
| Treating a negative check as complete because it names representative symbols | Build the full prohibited-item list and cover every item or a documented structurally complete pattern. |
| Checking only direct references after boundary cleanup | Also verify structural bypass surfaces such as root re-exports, wildcard exports, runtime entry files, and internal segment paths. |
| Assuming the intended proposal instruction wins across framework/config/generated surfaces | Build a final artifact resolution map and verify precedence, specificity, composition, and override rules. |
| Treating an artifact as valid because route/status/header/config resolves | Inspect final body/content and body-level dependencies. |
| Declaring clean pass from confidence | Do not say no blockers remain unless clean pass evidence can be named. |
| Treating a user action as valid because a handler exists | Verify the action changes the state, data, effect dependency, or navigation condition needed for the promised behavior. |
| Assuming refresh or re-render resets client state | Check framework behavior; preserved state can make proposed transitions fail. |
| Missing terminal-state recovery | For every terminal state, verify how the user exits, retries, or starts a new flow. |
| Treating Pre-Reconciliation Classification as the real process or as readiness status | It is an optional scan aid only: it uses `Classification status`, never the reconciliation `Status` field, and never implies clean pass/readiness. The mandatory Canonical Execution Loop (INV-1 through INV-7) and finalization rules control readiness. See `SKILL.md` "Pre-Reconciliation Classification". |
| Treating review-only mode as blocker resolution | If edits are forbidden and a blocker exists, report it as unresolved and do not claim clean pass. |
| Treating Compact Output as permission to skip gates | Compact Output only shortens final reporting; INV-1 through INV-7 remain mandatory. |
| Using final artifact map to check only route, status, headers, or config presence | Resolve precedence and inspect final body/content plus dependencies and verification destination. |
| Filling an output template from confidence | Every field needs evidence; unknown fields are `not verified`, and clean pass is not achieved. |
| Treating Compact Output as reduced evidence | Compact Output shortens reporting only. It never reduces gate coverage, evidence, concrete inventory, runtime checks, artifact resolution, verification destination checks, Output Contract requirements, or no-edit final pass requirements. |
| Confusing Compact Output with brief working notes | Output Depth controls user-facing reporting length only. Brief working notes are a Standard-profile evidence-depth allowance and still need claim-to-evidence traceability. |
| Treating Output Depth as replacing the Output Contract | Compact Output must still use the Compact Response Shape and include every Minimum Evidence Set field. |
| Keeping brief working notes after finding a blocker or user decision | If any blocker is found/resolved/remains or any user decision is required, augment pass evidence with a pass ledger before any readiness claim. A pass ledger never replaces the no-edit final pass. |
| Treating budget exhaustion as readiness | Budget or time exhaustion means `clean pass not completed`; it never means ready, clean enough, or safe to implement. |
| Keeping the initial profile after risk evidence appears | Raise the Review Profile immediately during inventory. |
| Treating all framework-rendered output as High-Risk | Raise risk for artifact ownership, precedence, dependencies, or verification impact, not mere framework rendering. |
| Treating every body/content change as High-Risk | Direct self-contained copy or UI content changes can remain Standard with brief working notes (evidence depth only) when ownership, dependencies, verification destination, and no-blocker/no-user-decision conditions are clear. Compact Output is a separate proposal-level choice; a self-contained sub-change never makes a High-Risk or blocker-bearing proposal Compact. |
| Treating `examples.md` as a substitute for concrete inventory | Examples illustrate evidence depth only. Run INV-1 through INV-7 and build exact inventory for the current source bundle. |
| Applying framework-specific examples as universal rules | Treat framework examples as possible patterns. Reconcile the actual codebase, framework semantics, final exposed surface, and dependencies in scope. |
| Editing source documents in review-only mode because an example shows a source edit | Source edits are allowed only in editable source mode or durable source mode. In review-only mode, report blockers as unresolved. |
| Treating a request to challenge a plan's merits/scope/rollout as reconciliation | That is dev-doc-review's job; reconciliation assumes intent is accepted and makes the plan codebase-accurate, and does not bless its merits. If the request is PURELY whether to do the plan and there is no separate source-of-truth artifact to reconcile, name dev-doc-review as the primary. If a reconcilable artifact is present (or it is ambiguous), still run the full canonical loop; if a product/scope choice is unavoidable to proceed, stop with `user decision required` rather than an informal handoff. |
| Treating static/structural doc accuracy (paths, imports, types, snippets resolve as written) as the whole job | Static accuracy is necessary but not sufficient. This skill must still run INV-4 runtime, INV-5 final artifact, and INV-6 verification-destination gates — a statically clean doc can still fail reconciliation. |
| Treating a clean reconciliation pass as proof the proposed code will run correctly at runtime | Reconciliation makes the source codebase-accurate and implementable; it does not replace proposal-runtime-validator's runtime validation. State clean pass for reconciliation scope only and note runtime validation as a separate, complementary step. |
| Treating the first zero-edit analysis pass as INV-7 | INV-7 is always a separate re-read run after the substantive pass — even when the first pass made no edits and found no blockers; a single pass can never be both. |
| Treating a historical clean result as proof that no future audit may find a problem | A clean result is bounded by its evidence. Preserve repeatability with an anchor, but allow fresh evidence or a fresh audit to surface real omissions. |
| Using replay because the user says only "verify again" or "review again" | Replay only an explicit prior-result validity question with a usable anchor or receipt. Route ambiguous requests through full INV-1 through INV-7. |
| Treating matching replay evidence as a new clean pass | Report `baseline matched` without a canonical `Status`; say only that the historical result remains applicable within its recorded scope and limitations. |
| Recording only repository HEAD or file status | Record bounded discovery recipes, a sorted candidate path-set signature, and content or exact diff identities for relevant dirty, untracked, ignored, or generated dependencies. |
| Replaying the same narrow search that created the candidate set and calling it independent closure | Before INV-7, test the highest-impact or most uncertain closure through a structurally different path. |
| During replay, auto-running build, test, typecheck, generation, privileged, or external commands because they look like checks | Classify recipes from observed effects. Automatically run only deterministic, bounded, read-only `safe-replay` recipes. This row governs replay only; a full reconciliation executes the `local` rows of the Verification Command Ledger. |
| Persisting anchors or receipts by default | Keep them response-only unless the user authorizes persistence or the current task already requires a durable handoff artifact. |
| Emitting only a Minimal Replay Anchor after a High-Risk clean pass or another receipt trigger | Emit the Durable Receipt extension with every risk-sensitive boundary, recipe, signature, evidence, freshness limit, remaining risk, and persistence status. Keep it response-only by default; persist only to a user-authorized or already task-authorized destination. |
| Treating filesystem writability or clean status as edit or implementation authority | Require current proposal-edit or implementation authority (explicit request, clear task context, or Edit Consent). Writability and readiness create neither. |
| Reusing an anchor after editing a proposal source | Keep it only as historical evidence. Emit a replacement only after a new full clean pass. |
| Spreading the triggered checklists (High-Risk Closure Checklist, State Transition Table, dated external facts) across repeated runs, one new lens per run | Run every triggered checklist in the first full pass. A repeat run that finds only an old-lens gap means an earlier pass skipped a gate. |
| Reporting a drift-only repeat as "improvements found" with no class counts | Report `Findings by class` and `Repeat guidance` (Output Contract). A stale value that meets the `refresh` row is reported under `refresh`, not `blocker`. |
