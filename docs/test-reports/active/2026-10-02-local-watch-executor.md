# Local watch executor — implementation and acceptance

Date: 2026-10-02. Proposal: [local-watch-executor](../../proposals/active/local-watch-executor.md).

## Scope and basis

- Initial base: `origin/dev` at `03876dd24fab12c63542b4565f087b79a877f7ef`.
- Final PR base: `6c363d0fa364c0456491bba6f56ac7cc21a3f4df`, after the comment-cleanup
  and watch-proposal PRs merged. Rebase preserved cleaned code comments and applied the
  current approved proposal's ownership/path/runbook corrections; token-management
  application changes are still outside this PR.
- Branch: `harness/local-watch-executor`; isolated checkout with its own dependencies,
  Next output and generated Prisma client. Original token-management work is preserved.
- Implements Stage 1 only: pure core, CLI, main-conversation watch skill, UI guidance,
  plugin version 0.4.0 and contract documentation. Stage 2 remains design only.
- Base plugin is 0.3.6; 0.3.7 and token-usage tracking existed in an unrelated dirty
  checkout during proposal review and are not copied into this PR.
- Server, Prisma schema/migrations, MCP tool registration, init, private templates,
  marketplace, package dependencies and scripts are unchanged.
- No merge, release promotion, production API/DB call, template seed, plugin update
  or paid Claude conversation was performed for this implementation.

## Automated verification

Initial existing core/CLI baseline: `npm test`, **188/188 PASS** before adding watch tests.
Targeted core watch tests: **43 PASS**. Targeted CLI tests: **23 PASS**.
Targeted UI/model/copy tests: **40 PASS**.

| Gate | Result | Evidence / boundary |
| --- | --- | --- |
| V1 | PASS | JSON/SSE, LF/CRLF, multiline data, matching id, trailing notifications, malformed/duplicate/missing response and tool refusals |
| V2 | PASS | All overview branches, slots-v1 entry, head-only policy, execution identity signatures and third returned work set/reset |
| V3 | PASS | Actual child process argv, positive timing limits, Git/bare/config/marker validation, repeated managed version, legacy omission and explicit URL precedence |
| V4 | PASS | Dummy 46-character hu_/hs_, invalid/owner tokens, every-request project scope and project_get identity/availability; no production credentials |
| V5 | PASS | Concurrent starts, live duplicate poller, force/stop during hung request, successor byte preservation, linked worktree common lock |
| V6 | PASS with limit | Config/token binding, config-free stop, corrupted state preservation, expired lock remains locked, abandoned guard fails closed, dead/live PID. EPERM/unknown PID conservatively live by code inspection; no privileged PID fault injection |
| V7 | PASS with limit | Hung fetch/body/deadline/Retry-After, five request/body timeouts, abort/reader/poller/tmp cleanup, ownership loss within the 1-second local check cadence. 180ms deadline test permits <1.6s total including child startup/OS scheduling. Windows process.kill termination is an OS forced exit; real terminal SIGINT/SIGTERM smoke remains manual |
| V8 | PASS | Fatal auth/4xx/redirect/RPC/tool/schema/oversize, transient sequence reset, request intervals and Retry-After, exact one-line output and no known token reflection |
| V9 | NOT RUN | Real supported Claude main conversation, background completion wake/rearm, permission and receipt handoffs. CLI tests cannot prove model instruction adherence |
| V10 | PASS | Acceptance + unstarted plan, handoff + unstarted implement, gate + verify/repeated project slot, held exclusion, other owner-turn fields preserved and copy lock |
| V11 | PASS automated; browser pending | Actual React static HTML, inline Code, empty box, read-only hide, exact CopyButton payload, gate-copy/rail tooltip and product-copy §3/§18. Real clipboard/narrow-width Board/Inbox browser check remains pending |
| V12 | PARTIAL | Version/marketplace structure, source/core-to-lib/body and automated architecture checks; actual installed Claude skill discovery/cache/body acceptance pending |
| V13 | NOT RUN | Actual mathgic gate→work→agent_next receipt, 110-minute idle/rearm, permission windows and HTTP/model/Neon/Vercel cost observations |

Full validation on the initial base: `npm test` **254/254 PASS**, `test:web`
**512/512 PASS**, `check` PASS (lint/typegen/typecheck, architecture **26/26**,
project-availability **18/18**), and production build PASS. `verify:fsd` PASS.
Lint has one existing `_success` warning in the unrelated src-clean-code browser fixture;
this change adds no warning. The initial sandboxed build could not download existing Google
fonts; the same unchanged build passed with approved network access. Prisma generation
uses the isolated checkout and a loopback placeholder URL, without DB connections.

The added shell test invokes the real CLI from PowerShell and Git Bash using a plugin
path containing an apostrophe and space, with no plugin-root environment variable.
Its minimal package revealed the existing transitive `workspaces → entitlement`
dependency; the fixture and skill/proposal artifact preflight now name both modules.
All fixed local error reasons observed by child-process tests match product-copy §15.

Final validation on the rebased PR source: `npm test` **254/254 PASS**, `test:web`
**512/512 PASS**, `check` PASS (lint/typegen/typecheck, architecture **26/26**,
project-availability **18/18**), and production build PASS. The unchanged existing
lint warning remains the only warning. Scope preflight confirms exactly the 21
implementation targets plus the proposal itself, byte-equal
core/lib modules, manifest 0.4.0, marketplace source/version precedence, exact skill
description and both §3/§18 hints. Preserved server/Prisma/init/templates/marketplace
and dependency/script surfaces have no diff against the final PR base.

Browser fixture bundling succeeded using actual components and the production CSS, but
Computer Use returned no available browser (`apps:[]`, `browsers:[]`). No visual/clipboard
pass is claimed; the temporary loopback fixture server was stopped.

Two test refinements did not change existing expectations: the repeated-slot fixture uses
the actual `feature-scout#2` syntax, and the ESM/CJS JSX test recognizes the real
CopyButton by its component name rather than cross-loader function identity.
The CLI stop regression changed the implementation: ownership is checked before rereading
config so a completed stop returns replaced even after setup files disappear.

## Phase 3 — interactive isolated acceptance (pending)

Use Claude Code 2.1.287 or a separately verified newer version, a disposable Git checkout,
dummy environment token/server and an SDK stateless loopback MCP fixture. Register only
the fixture with `--strict-mcp-config --mcp-config`; load this branch's plugin via
`--plugin-dir`. Do not set a CLAUDE_PLUGIN_ROOT shell environment variable.

Record actual plugin absolute path and body hashes (SKILL, CLI, lib and init contract),
CLI/tool version, external verification package identity, current task/output/session/policy,
observed request order and receipt-bearing WAIT→PLAN→WAIT fixture behavior. Confirm
idle rearm, head policy, per-action ownership, permission/commit waits and owner stop
discarding late completion. A name/version-only check does not establish body resolution.
Do not advance to release if this session smoke fails.

## Phase 4 — browser acceptance (pending)

On Board/Inbox use a gate/acceptance/handoff next to an unstarted item, spaces/long key
and narrow viewport. Confirm all terminal lines, one quiet inline `/harness:watch`, actual
copied terminal payload, read-only hides guidance and unavailable project hides banner.
Keep the compact strip's behavior unchanged. Record screenshots and clipboard values
without tokens or other credentials.

## Phase 5 — deployment and operating observations (pending)

Implementation commit/PR: the feature commit and Draft PR provide the exact revision.
Draft status retains the required interactive/installation acceptance before integration;
there is no claim that all V1–V13 or production readiness are complete.
Deployment SHA/plugin installation path/actual loaded version: not observed yet.
No template reseed is required or claimed.

After a green `check` workflow and approved integration, merge to dev; promote main by
fast-forward only. Stop existing watchers before updating. Inspect the real local source
or hosted cache's 0.4.0 bodies and restart the Claude session before acceptance.

Record the owner's local gate-open time, work-output time and next successful
agent_next local receipt time (runId/revision/stepId), plus server gate event as supporting
evidence without subtracting unverified clocks. Record the actual 110-minute idle and
rearm, policy/permission windows, HTTP/model calls, DB compute/cost and stop preventing
new requests. In-flight server effects and already dispatched agents are outside local
cancellation guarantees. No phone push, resident spawn or cross-device lock claim.

The proposal remains active until these pending acceptance steps are observed. Automated
tests are implementation evidence, not proof of a successful production watch session.
