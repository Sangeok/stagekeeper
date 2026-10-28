# Revalidation and Replay

Use this file before the Coverage Stability Check, before emitting replay evidence, and whenever a user refers to a prior reconciliation result.

## Contents

- Coverage Stability Check
- Repeat-Request Routing
- Minimal Replay Anchor
- Replay Recipe Classes
- Replay Procedure and Outcomes
- Durable Receipt
- Authority and Invalidation
- Safety and Limitations

## Coverage Stability Check

Run this check after INV-1 through INV-6 find no unresolved blocker and before INV-7. Its purpose is to make the selected evidence boundary reproducible without expanding into speculative repository-wide exploration.

1. Support every tested current-scope boundary with evidence from INV-2 through INV-6 or a Review Profile trigger.
2. Select the most uncertain or highest-impact closure claim and test it through a structurally different path. Examples include file enumeration plus symbol provenance, route-tree inspection plus destination verification, or config input inspection plus resolved artifact inspection.
3. For every other plausible but untested current-scope boundary, record an evidence-backed exclusion. If an exclusion cannot be supported, test the boundary or raise the proposal to High-Risk and close it there.
4. Reject representative sampling and confidence-only exclusions.
5. Do not search unrelated repository surfaces merely to strengthen the record.

For High-Risk reconciliation, test every plausible current-scope risk-sensitive boundary. Exclude a boundary from direct testing only when evidence shows it is outside current scope or is not risk-sensitive; record that evidence. Do not use a generic exclusion in place of risk-sensitive closure.

If this check finds a missing boundary, return to the applicable INV gate. Do not run INV-7 until the gap is resolved without changing user intent or is reported as a blocker or user decision.

## Repeat-Request Routing

Classify the request before comparing anything:

| Request | Route |
| --- | --- |
| Explicitly asks whether the prior result is still valid, and a usable anchor or receipt exists | Replay |
| Says only verify, review, reconcile, or check again | Full INV-1 through INV-7 |
| Requests a fresh audit or independent re-review | Full INV-1 through INV-7 |
| Implementation is about to start | Full implementation-readiness INV-1 through INV-7 pass |
| Scope, source, bounded inventory, or prior basis changed or is unknown | Full INV-1 through INV-7 |
| Anchor or receipt is missing, unusable, contradictory, or not safely comparable | Full INV-1 through INV-7 |

Replay answers only whether the recorded historical result remains applicable to the recorded boundary. It is not a new reconciliation and cannot claim new completeness or readiness.

## Minimal Replay Anchor

Emit one compact anchor after every `clean pass achieved`. Keep it in the response by default.

A Minimal Replay Anchor is usable only when its bounded code basis records:

- an opaque repository identity and current `HEAD`
- identities for every proposal source and directly referenced in-scope source
- bounded repository-relative roots plus relevant symbol, config, route, and artifact anchors
- the exact discovery or closure recipes used to construct the candidate set
- a deterministic signature of the sorted candidate path set that detects additions and removals
- for every relevant dirty, untracked, ignored, or generated dependency used by INV-2 through INV-6, its repository-relative path plus a content identity or exact diff identity; status alone is insufficient

Also record:

- scope, phase, and Review Profile
- the stability claim and why each recipe was selected
- each recipe class, exact recipe or declarative manifest, and observed signature
- untested plausible boundaries and evidence-backed exclusions
- final-pass source basis and no-edit confirmation
- the historical reconciliation status, labeled as historical rather than a new claim
- the limitation: the anchor records applicability evidence only and does not prove completeness, correctness, or absence of defects

Use repository-relative paths. Treat a content identity as a digest or equivalent comparison token; do not record raw sensitive content. Never use a credential-bearing remote URL as repository identity.

Do not compute or require a whole-repository hash. Bound the anchor to evidence actually used by the reconciliation. If any required identity, candidate-set recipe, path-set signature, or relevant non-HEAD dependency cannot be compared, mark the anchor unusable and route to `indeterminate` and then the full loop.

Recommended compact shape:

```text
Minimal Replay Anchor:
- Limitation: applicability evidence only; not proof of completeness, correctness, or no defects
- Repository: <opaque identity>; HEAD: <identity>
- Source identities: <source -> identity>
- Scope / phase / profile:
- Bounded basis: <roots and anchors>
- Candidate closure: <recipe>; path-set signature: <identity>
- Non-HEAD dependencies: <relative path -> content/diff identity, or none>
- Stability checks: <claim -> reason -> class -> recipe/manifest -> observed signature>
- Untested boundaries and exclusions:
- Final-pass basis: <latest saved bundle>; no-edit: yes
- Historical status: clean pass achieved; this is not a new clean claim
```

## Replay Recipe Classes

Classify every recorded recipe before reuse:

| Class | Meaning | Replay behavior |
| --- | --- | --- |
| `safe-replay` | Deterministic, read-only, bounded, and free of privilege, mutation, material cost, credentials, and external effects | May run automatically |
| `manifest-only` | Records structure, destination, command shape, or planned contract but is not safe or meaningful to execute during replay | Safely inspect the current declarative manifest or structure and compare it with the recorded form; never execute the underlying operation or claim execution |
| `volatile-non-replayable` | Depends on external state, time, privilege, credentials, mutation, side effects, or material cost | Never auto-run; refresh only through a targeted safe action that is relevant and already authorized |

Do not infer safety from a command name. Build, test, typecheck, package-manager, framework, and code-generation commands may create caches, lockfiles, or generated artifacts. Classify them from observed project behavior.

Never auto-run a destructive, privileged, mutating, costly, credential-dependent, or external-effect command. If correctness depends on volatile evidence and no safe authorized refresh exists, report `indeterminate` and continue with the full loop.

## Replay Procedure and Outcomes

1. Confirm that the request qualifies for replay.
2. Validate the anchor or receipt structure and its recorded limitation.
3. Compare source identities, scope, phase, profile, repository identity, `HEAD`, bounded roots and anchors, candidate path-set signature, and relevant non-HEAD dependency identities.
4. Run only `safe-replay` recipes. Compare `manifest-only` entries without execution. Handle volatile evidence according to its class.
5. Check current evidence for contradictions even when recorded signatures match.
6. Produce exactly one interim replay outcome.

| Outcome | Use when | Required action |
| --- | --- | --- |
| `baseline matched` | Every correctness-relevant recorded basis is comparable and unchanged, and no contradiction appears | End a comparison-only request without a canonical `Status`. Say only that the historical result remains applicable within the recorded scope and limitations. |
| `drift` | A source, bounded code basis, candidate set, relevant dependency, observed signature, scope, phase, profile, or current fact changed | Treat as interim, automatically run full INV-1 through INV-7, and report the final canonical `Status`. |
| `indeterminate` | A required basis is missing, unsafe, expired, incomparable, or dependent on unavailable correctness-critical volatile evidence | Treat as interim, automatically run full INV-1 through INV-7, and report the final canonical `Status`. |

Current contradictory evidence always overrides a matching anchor or receipt. Do not suppress a real newly discovered blocker because a historical pass was clean.

When `drift` or `indeterminate` triggers the full loop, do not present the interim outcome as a reconciliation status. The final response may name the routing reason, but its canonical `Status` must come from the completed full loop.

## Durable Receipt

Emit a Durable Receipt in addition to the Minimal Replay Anchor when any of these conditions applies:

- High-Risk reconciliation
- cross-session or cross-agent handoff
- delayed implementation
- an explicit user request

A Durable Receipt extends the Minimal Replay Anchor with every risk-sensitive boundary, recipe, and signature; runtime, artifact, and verification evidence; correctness-relevant volatile evidence and its freshness limits; remaining risks; redaction status; and persistence information.

Keep the receipt response-only by default. Do not create a sidecar file unless the user explicitly authorizes persistence or the current task already requires a durable handoff artifact. Record the approved destination when persisting it.

Recommended extension shape:

```text
Durable Receipt:
- Extends Minimal Replay Anchor: <anchor identity>
- Risk-sensitive boundaries / recipes / observed signatures:
- Runtime evidence and freshness:
- Final artifact evidence:
- Verification-destination evidence:
- Volatile evidence and freshness limits:
- Remaining risks and closure paths:
- Redaction: applied
- Persistence: response-only | authorized destination
```

## Authority and Invalidation

- Clean readiness creates neither proposal-edit authority nor implementation authority.
- Edit proposal sources only when the current request explicitly grants proposal-edit authority or the current task context clearly requires those edits. Filesystem writability is not authority.
- Implement only when the current request already grants implementation authority. Do not request redundant confirmation when that authority is clear.
- In review-only work, stop after reporting the result.
- Any proposal-source edit invalidates the anchor or receipt for present replay. Preserve the old record only as historical evidence and emit a replacement only after a new full clean pass.

## Safety and Limitations

- Redact secrets, credentials, tokens, personally identifiable information, absolute paths, credential-bearing remotes, and unnecessary internal details.
- Do not place raw secret-bearing content in an anchor or receipt. Use a safe identity when permitted; otherwise mark comparison indeterminate.
- Treat a lost response-only anchor as unavailable and run the full loop.
- If repository identity or `HEAD` is unavailable or cannot be compared, including a non-Git or insufficiently preserved ephemeral workspace, route to `indeterminate` and then the full loop.
- Matching recorded evidence improves repeatability but cannot prove that the original evidence boundary was complete. A fresh audit may legitimately find a previously missed issue.
