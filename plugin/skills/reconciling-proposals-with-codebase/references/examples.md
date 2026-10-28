# Examples

Examples never replace INV-1 through INV-7, concrete inventory, the no-edit
final pass, or source-document mode rules. They are not templates and not
representative sampling. Use this one worked example to calibrate evidence
depth and classification, then reconcile the actual source bundle in front of
you. `[framework note]` marks framework-specific details; treat them as
patterns, not rules.

_Last validated against the gates: 2026-07-16._

Read this example for evidence depth, blocker handling, and no-edit final-pass
behavior. Do not infer that every proposal needs this much visible reporting.
Bounded Standard proposals may use brief working notes and Compact Output,
while still running every gate.

If a real proposal does not match this example, do NOT add another example.
The gates generalize. If the gates feel ambiguous for that case, fix the gate
text, not this file.

## Worked Example (High-Risk, editable source mode)

### Proposal source (input), `proposal.md` v1

> ## Cart discount codes
> 1. Move `formatPrice` from `lib/utils.ts` to `lib/pricing/format.ts`.
> 2. On `/cart`, add an "Apply" button beside a discount-code input.
>    Update the cart import to `import { formatPrice } from '@/lib/pricing/format'`.
> 3. Verification: open `/cart`, confirm prices still render and the button shows.

Profile: **High-Risk** - discount affects money/entitlements. Selected at INV-2
the moment the money trigger appears; never lowered mid-pass.

---

### Pass 1

**INV-1 Source bundle.** `proposal.md` v1 + `lib/index.ts` (the public barrel,
pulled in because the move's provenance runs through it). No other plan/spec is
delegated to. Bundle complete.

**INV-2 Concrete inventory + import/export provenance** (exact, not a sample)

```
$ rg -n "formatPrice"
lib/utils.ts:42:export function formatPrice(
lib/index.ts:8:  export { formatPrice } from './utils'
app/cart/page.tsx:5:     import { formatPrice } from '@/lib/utils'
app/checkout/page.tsx:7: import { formatPrice } from '@/lib/utils'
components/order-summary.tsx:3: import { formatPrice } from '@/lib'   [framework note: via barrel]
```

| Symbol | Current owner | Public export | Proposal post-change import | Actual consumers | Verification destination |
| --- | --- | --- | --- | --- | --- |
| formatPrice | lib/utils.ts:42 | lib/index.ts:8 -> `./utils` | cart only -> `@/lib/pricing/format` | cart, checkout (direct), order-summary (barrel) | new path resolves at all consumers + `@/lib/utils` formatPrice absent |

Inventory surfaces what the proposal omitted:

- **B1 (blocker)** - proposal updates only `cart`; `checkout/page.tsx:7` also
  imports the old path (direct consumer) -> build breaks. *Fix = edit that import.*
- **B2 (blocker)** - `lib/index.ts:8` barrel still re-exports from `./utils`;
  `order-summary.tsx` consumes via the barrel [framework note: structural bypass
  surface] the proposal never names. *Fix = repoint the barrel; the consumer
  stays untouched.*

**INV-3 Requirement/snippet/placeholder audit.** The import line is a complete,
copyable snippet -> treat as an implementation surface; it covers only `cart`
(confirms B1/B2). Placeholder scan: no `TBD`/`TODO`/`decide later` in scope.
No prose/snippet conflict beyond B1/B2.

**INV-4 Runtime behavior** - the "Apply" button. The proposal names a control
with **no executable transition**.

- **B3 (blocker)** - visible control, no defined state/data/effect: what does
  Apply do, what state moves?
- **D1 (user decision required)** - behavior for an invalid/expired code is
  unspecified (inline error? silent ignore? block checkout?). This is **product
  behavior** -> do not guess silently. Stop.

The pass stops immediately at D1. Do not continue to INV-5 or INV-6, and do
not edit the proposal while the product decision is unresolved.

```markdown
Status: user decision required
- Blocking decision: behavior for invalid/expired discount code
- Why: changes user-facing product behavior and checkout eligibility
- Options: (a) inline error, no apply (b) silent ignore (c) block checkout
- Source section affected: proposal.md section "Cart discount codes", step 2
```

---

### After the decision

User chooses **(a) inline error, do not apply, do not block other items.**
Under the already established proposal-edit authority (the request asked to
reconcile, so no separate Edit Consent was needed), write D1 plus the currently
visible B1-B3 resolutions into `proposal.md` -> **v2**. The edit resets
readiness, so restart from INV-1.

### Pass 2 - full pass over `proposal.md` v2

INV-1 through INV-4 now reconcile the complete consumer inventory and the
accepted invalid-code transition. Continue to the gates that Pass 1 did not
reach.

**INV-5 Final artifact resolved** - the proposed rendered cart total is a
money-bearing body, in scope.

| Final Artifact | Influencing Sources | Precedence Basis | Final Body/Content | Body-Level Dependencies | Verification Destination |
| --- | --- | --- | --- | --- | --- |
| Cart total (rendered by RSC) | items subtotal; applied discount (`applyDiscount`) | valid discount overrides raw subtotal; total after the server action is authoritative [framework note] | formatted discounted total value | `formatPrice` (currency/locale inputs), discount rule, items subtotal | rendered cart-total node value |

The proposal now identifies the intended winning body and dependency chain.
This is reconciliation of the implementation source, not a claim that the code
has already been changed.

**INV-6 Verification destination**

- **B4 (blocker)** - "confirm prices render" checks *presence*, not the INV-5
  resolved body (the discounted total value), and omits old-path absence.
  The plan must assert the discounted value at the cart-total node **and**
  verify that the old `formatPrice` owner/import path is absent after implementation.

Write B4 into `proposal.md` -> **v3**. Because this pass edited the source,
report `clean pass not completed` and restart from INV-1.

### Pass 3 - no-edit final pass over `proposal.md` v3

| Check (INV-4 Next.js server action) | Must answer (v3) |
| --- | --- |
| Initial state | cart items, no code; total = sum |
| Success path | valid code -> `applyDiscount` action -> returns discounted total -> re-render |
| Failure path | invalid/expired -> inline error, total unchanged (D1=a) |
| Terminal state | user can remove/edit code, proceed to checkout |
| Retry/re-entry | edit code input -> resubmit |
| Input change | cart items change -> re-validate code applicability |
| Cleanup | pending submit aborted on route change [framework note] |
| Runtime semantics | action revalidates cart cache [framework note]; verified against Next.js docs |

Re-checked against current ownership and planned post-change destinations; no
source edits made:

- INV-1: bundle unchanged (proposal v3 + barrel). INV-3: no placeholders.
- B1: current code still shows both direct consumers at the old owner; v3 names
  both exact consumers and requires both post-change imports.
- B2: current barrel still exports `./utils`; v3 requires repointing it to
  `./pricing/format` and preserves `order-summary` as a barrel consumer.
- B3: transition defined (table). B4: verification asserts the INV-5 resolved
  discounted body, new presence, old absence, and public-barrel resolution.
- INV-5: the planned final artifact map resolves the discounted total body and
  its `formatPrice`, discount-rule, and subtotal dependencies.

**Pass ledger**

| Pass | Input Source Basis | New or Repeated Blockers | Source Changes Saved | Remaining Status | Next Action |
| --- | --- | --- | --- | --- | --- |
| 1 | proposal v1 | B1 B2 B3 + D1 | none; stopped at D1 | user decision required | get D1 |
| Decision edit | proposal v1 + D1=a | B1 B2 B3 + accepted D1 | proposal v2 | clean pass not completed | full pass |
| 2 | proposal v2 | B4 | B4 -> proposal v3 | clean pass not completed | full no-edit final pass |
| 3 | proposal v3 | none | none (no-edit) | clean pass achieved | implement only under current implementation authority; otherwise await an implementation request |

```markdown
Status: clean pass achieved
- Final pass basis: proposal.md v3, no-edit (pass 3)
- No-edit final pass: yes
- Evidence: bundle(proposal+barrel); inventory(3 consumers expanded, provenance);
  runtime(state table); final artifact map(resolved: discounted total body);
  snippet+placeholder audit(import snippet=surface; no TBD/TODO);
  verification destination(planned new presence + old absence)
- Remaining non-blocking risks: none
- Minimal Replay Anchor: emitted below
- Durable Receipt: emitted below because the reconciliation is High-Risk
```

The pass also completes the Coverage Stability Check: import/export provenance
is tested through both symbol search and public-barrel resolution; invalid and
expired code behavior is closed through the runtime transition table; and the
money-bearing cart body is closed through its planned rendered destination.
Every plausible current-scope risk-sensitive boundary is tested. Unrelated
routes are excluded only because inventory shows no named, imported, routed,
configured, generated, dependency-bearing, or verification-dependent link.

```text
Minimal Replay Anchor:
- Limitation: applicability evidence only; not proof of completeness, correctness, or no defects
- Repository: repo:<opaque-id>; HEAD: <commit-id>
- Source identities: proposal.md v3 -> <content-id>; lib/index.ts -> <content-id>
- Scope / phase / profile: cart discount Core / current phase / High-Risk
- Bounded basis: lib/, app/cart/, app/checkout/, components/order-summary.tsx;
  formatPrice provenance, cart-total artifact, discount transition
- Candidate closure: `rg --files lib app/cart app/checkout components/order-summary.tsx`
  with a deterministic relative-path sort, plus `rg -n "formatPrice" lib app/cart
  app/checkout components/order-summary.tsx`; path-set signature: <sorted-path-set-id>
- Non-HEAD dependencies: none
- Stability checks: required-symbol closure -> highest-impact move boundary -> safe-replay
  -> the exact bounded `rg -n "formatPrice" ...` recipe above -> <observed-signature>;
  rendered total contract -> runtime destination -> manifest-only
  -> <recorded destination/assertion shape> -> <manifest-signature>
- Untested boundaries and exclusions: unrelated routes -> no named, imported, routed,
  configured, generated, dependency-bearing, or verification-dependent connection
- Final-pass basis: proposal.md v3 + directly referenced bundle; no-edit: yes
- Historical status: clean pass achieved; this is not a new clean claim
```

```text
Durable Receipt:
- Extends Minimal Replay Anchor: <anchor-id>
- Risk-sensitive boundaries / recipes / observed signatures: consumer provenance,
  invalid-code transition, money-bearing final body, old-absence/new-presence checks
  -> <provenance-signature>, <runtime-signature>, <artifact-signature>, <verification-signature>
- Runtime evidence and freshness: v3 transition table + <framework-doc identity/date>
- Final artifact evidence: cart-total resolution map -> <manifest-signature>
- Verification-destination evidence: rendered total + import/barrel boundary contract
- Volatile evidence and freshness limits: framework semantics require safe authorized refresh when stale
- Remaining risks and closure paths: none
- Redaction: applied
- Persistence: response-only
```

If the user later asks specifically whether this historical result is still
valid and supplies this usable anchor, compare the recorded basis. A complete
match ends at `Replay outcome: baseline matched` without a canonical `Status`.
Any drift, indeterminate comparison, or current contradiction routes
automatically through a full INV-1 through INV-7 pass.

## This example calibrates depth, not shape

The blocker count (4), the single user decision, the three-pass convergence, and
the specific gap types (missed consumer, barrel re-export) are incidental to
this scenario, not a checklist. Your proposal may have zero blockers or a
dozen, may need one pass or five, and may end in `clean pass not completed`,
`user decision required`, or `stuck blocker`. In particular, a fix often
introduces a NEW blocker (e.g., repointing a barrel breaks an unrelated
re-export), forcing another pass; this convergence is not the norm.
Run INV-1 through INV-7 on your material; do not pattern-match this shape.

## Self-contained UI/copy change note (do not write a second example)

Same skill, **Standard** profile with brief working notes and **Compact Output**
- if the change were only "rename the button label `Apply` -> `Apply code`":

- Profile: Standard.
- Working evidence: brief notes allowed only because the proposal is bounded (proposal-level qualifier; see SKILL.md Bounded Proposal Conditions), no
  blocker appears, and no user decision is required.
- Output Depth: Compact.
- Output Contract: Compact Response Shape with every Minimum Evidence Set field.
- INV-1/INV-2: proposal + the one component file + its render destination. Exact.
- INV-3: no snippets/placeholders in scope.
- INV-4: **not in scope** - record the evidence (no state/data/effect change).
- INV-5: final body = rendered label; winning source obvious; no body-level deps.
- INV-6: verify the rendered label at its destination.
- Coverage Stability Check: use a second structural path for the label's most
  uncertain closure and record evidence-backed exclusions for any plausible
  untested current-scope boundary.
- INV-7: no-edit final pass required before any clean-pass claim.
- After clean status: emit a compact Minimal Replay Anchor even though the
  working notes and user-facing report are brief.

All seven gates still run; they may collapse to brief evidence only when the
Standard bounded/no-blocker/no-user-decision conditions hold. Compact Output
shortens reporting only; it never shortens reconciliation or reduces evidence.
