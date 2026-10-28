# Runtime and Artifacts

Use this file when behavior, runtime state, framework semantics, generated output, configured output, or final exposed artifacts are in scope.

## Runtime Behavior Review

Do not only check current-code compatibility. Also simulate the new behavior the proposal introduces.

Review:

- user-visible interactions and controls
- event handlers and state transitions
- redirects, refreshes, navigation, callbacks, polling, direct requests, and retries
- auth, authorization, and identity-dependent branches
- transactions and external side effects
- cache invalidation, render timing, routing, streaming, and framework conventions
- cleanup for timers, requests, locks, subscriptions, and background work
- input, query, identity, or prop changes that should reset or restart work

A visible control without an executable state/data/effect/navigation transition is a blocker.

Unknown runtime semantics are blockers when the proposed behavior depends on them for correctness, safety, authorization, persistence, recovery, cleanup, or final artifact validity. If the unknown is proven not behavior-critical, record it as a non-blocking risk with the verification path that will close it during implementation.

## State Transition Table

For each behavior-affecting proposal, write or mentally execute:

| Check | Must answer |
| --- | --- |
| Initial state | What state/data starts the flow? |
| Success path | What exact event moves it to success? |
| Failure path | What exact event moves it to failure? |
| Terminal state | Can the user leave or recover from each terminal state? |
| Retry/re-entry | What state/data/dependency changes to restart work? |
| Input change | What resets when props, query, identity, or inputs change? |
| Cleanup | What cancels timers, requests, locks, or subscriptions? |
| Runtime semantics | Which framework behavior is required, and where was it verified? |

This is the canonical **State Transition Table**. `references/gate-details.md` (INV-4) points here instead of copying it, so there is one source for these rows. Scope differs by location and is intentional: in INV-4 these rows apply to new state machines or user-visible flows; here they apply to each behavior-affecting proposal.

Unknown runtime semantics remain blockers until verified from current code, local docs, or primary documentation, unless the pass can show they are not required for correctness, safety, authorization, persistence, recovery, cleanup, or final artifact validity.

## Framework-Sensitive Assumptions

Check assumptions about:

- client state preservation across refresh, route changes, redirects, or re-render
- server/client component boundaries
- data loading and caching behavior
- generated routes, metadata, or manifest files
- middleware, callbacks, hooks, effects, transactions, and cleanup timing
- precedence between file-based routing, config, generated artifacts, and runtime overrides

If the behavior depends on framework semantics and the current codebase does not prove them, verify with local or official docs.

## Final Artifact Resolution

For every framework-managed, generated, configured, or convention-based output, build a final artifact resolution map:

| Final Artifact | Influencing Sources | Precedence Basis | Final Body/Content | Body-Level Dependencies | Verification Destination |
| --- | --- | --- | --- | --- | --- |

Resolve:

- which source/config/generated surface wins
- specificity, composition, and override behavior
- final body/content, including rendered, streamed, downloaded, serialized, generated, or embedded output
- body-level dependencies such as assets, fonts, media, schemas, data, translations, fixtures, generated files, and embedded resources
- verification destination for the actual exposed artifact

Artifact examples are illustrative, not framework requirements.

A route/status/header check is insufficient when the final body is influenced by config, generated output, convention files, metadata composition, translations, assets, schema-generated data, embedded content, or runtime overrides.

For rendered, serialized, downloaded, streamed, or generated bodies, verify the exposed body/content and the dependencies needed to produce it.

Do not treat an artifact as valid because its route, status, headers, or config resolve. Inspect the body or serialized output and verify the resources needed to render or consume it.

Do not treat every framework-rendered surface or body/content change as High-Risk. Direct self-contained copy or UI content changes may remain Standard with brief working notes when the winning source, body-level dependencies, verification destination, and no-blocker/no-user-decision conditions are clear. (Compact Output is a proposal-level reporting choice: it applies only when the WHOLE proposal independently satisfies the Compact conditions in the SKILL.md Output Contract. A self-contained sub-change inside a High-Risk or blocker-bearing proposal never lowers the proposal's Output Depth to Compact.) Compact Output never reduces runtime, final artifact, body/content, body-level dependency, or verification destination checks.

Raise to High-Risk when the proposal affects artifact precedence, generated output, configured output, serialized/rendered/downloaded body ownership, body-level dependencies, verification destinations, or when any of those ownership or dependency questions are ambiguous.

## Post-Change Destination Checks

When behavior, copy, config, schema, data, or generated output moves:

- verify the new destination has the expected behavior/content
- verify the old destination no longer exposes stale behavior/content when absence is part of the claim
- verify public imports, route consumers, generated references, or runtime entry points are updated
- verify structural bypass surfaces such as root re-exports, wildcard exports, runtime entry files, and internal segment paths when boundaries are in scope

Negative checks must cover the full prohibited-item list, not representative symbols.
