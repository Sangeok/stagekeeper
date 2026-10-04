# Local watch executor — implementation and acceptance

Date: 2026-10-02. Proposal: [local-watch-executor](../../proposals/completed/2026-10-03-local-watch-executor.md).

Completion update (2026-10-03): PR #100 merged into dev on 2026-10-02 at
`0aec9ab9144f6c9c26c5e39c3321c09771791ddb`. At the user's request, the proposal is
completed on the basis of Stage 1 code implementation and the recorded verification.
The sections below preserve implementation-time evidence; this report stays active for
the pending browser, hosted-cache, deployment and operating acceptance follow-ups.

## Scope and basis

- Initial base: `origin/dev` at `03876dd24fab12c63542b4565f087b79a877f7ef`.
- Final PR base: `495bd22a89f1eeb2bef12d09a60fe89a8eff46b9`, after the comment-cleanup,
  watch-proposal and token-management PRs merged. The earlier rebase onto `6c363d0`
  preserved cleaned code comments; updating the feature branch to final dev retains
  token-management application changes and resolves only the plugin-version conflict.
  Token-management application changes are not additions made by the watch PR.
- Branch: `harness/local-watch-executor`; isolated checkout with its own dependencies,
  Next output and generated Prisma client. Original token-management work is preserved.
- Implements Stage 1 only: pure core, CLI, main-conversation watch skill, UI guidance,
  plugin version 0.4.0 and contract documentation. Stage 2 remains design only.
- Final base plugin is 0.3.7; token-usage tracking is now accepted dev behavior from
  PR #99. Every accepted credential still awaits its usage-record query; the 60-second
  row-update condition does not remove that DB round trip from watch polling.
- Server, Prisma schema/migrations, MCP tool registration, init, private templates,
  marketplace, package dependencies and scripts are unchanged.
- No PR merge, release promotion, production API/DB call, template seed or global
  plugin update was performed. Initial implementation did not run a Claude conversation;
  the readiness follow-up below exercises the actual logged-in CLI against loopback MCP.

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
| V9 | PASS bounded main-conversation smoke; operating acceptance pending | Claude 2.1.287 main conversation actually received completion notices, rearmed after idle, dispatched a fixture dev with the fresh entry and commit:no, preserved its receipt, rearmed after completion and discarded a late idle after owner stop. A separate commit:no handoff retained the receipt and paused without success submission or rearm. See readiness evidence below; real terminal permission windows and production behavior remain unverified |
| V10 | PASS | Acceptance + unstarted plan, handoff + unstarted implement, gate + verify/repeated project slot, held exclusion, other owner-turn fields preserved and copy lock |
| V11 | PASS automated; browser pending | Actual React static HTML, inline Code, empty box, read-only hide, exact CopyButton payload, gate-copy/rail tooltip and product-copy §3/§18. Real clipboard/narrow-width Board/Inbox browser check remains pending |
| V12 | PASS local source; hosted cache pending | Actual Claude init and Skill invocation resolve harness@inline 0.4.0 from this PR's plugin directory, discover init/watch and run its CLI without a CLAUDE_PLUGIN_ROOT environment variable. Effective complete verification package was inspected. Existing hosted cache was not updated |
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

Validation after rebasing onto `6c363d0`: `npm test` **254/254 PASS**, `test:web`
**512/512 PASS**, `check` PASS (lint/typegen/typecheck, architecture **26/26**,
project-availability **18/18**), and production build PASS. The unchanged existing
lint warning remains the only warning. Scope preflight confirms exactly the 21
implementation targets plus the proposal itself, byte-equal
core/lib modules, manifest 0.4.0, marketplace source/version precedence, exact skill
description and both §3/§18 hints. Preserved server/Prisma/init/templates/marketplace
and dependency/script surfaces have no diff against that PR base.

Latest-dev validation after updating to `495bd22`: `npm test` **254/254 PASS**,
`test:web` **526/526 PASS**, `check` PASS (lint/typegen/typecheck, architecture **26/26**,
project-availability **18/18**), and production build PASS. The existing lint warning
remains the only warning; the changed token-reveal test also passes targeted lint.
The first web rerun exposed the newly merged init-package test's exact 0.3.7 version
expectation. It now expects 0.4.0 while retaining every init-guidance body assertion;
this one-line update is included in the proposal inventory and V12 destination.
Scope preflight confirms exactly **22 implementation targets plus the proposal**,
byte-equal core/lib, manifest 0.4.0, and no additional server/Prisma/init/templates/
marketplace/dependency changes against final dev. The merged token-usage behavior is
the accepted base; no DB integration or production cost observation was performed.

The first local core rerun beside web/lint failed two very short timing assertions
(the 180ms deadline's total process overhead and the number of requests reaching the
fixture before 50ms aborts). The full core suite then passed alone with the same
assertions and CLI source unchanged. The GitHub workflow runs these suites sequentially;
its check on `e3aa3f5` also passed. No timing threshold or request-count expectation was
relaxed to obtain a pass.

Browser fixture bundling succeeded using actual components and the production CSS, but
Computer Use returned no available browser (`apps:[]`, `browsers:[]`). No visual/clipboard
pass is claimed; the temporary loopback fixture server was stopped.

Two test refinements did not change existing expectations: the repeated-slot fixture uses
the actual `feature-scout#2` syntax, and the ESM/CJS JSX test recognizes the real
CopyButton by its component name rather than cross-loader function identity.
The CLI stop regression changed the implementation: ownership is checked before rereading
config so a completed stop returns replaced even after setup files disappear.

## Phase 3 — isolated main-conversation acceptance

On 2026-10-02, the implementation at `e3aa3f520145debe84846bbf38d506743b4a23e2`
was exercised in a disposable Git checkout with a dummy hu_ token and the installed
`mcp-handler` / SDK stateless HTTP handler bound only to 127.0.0.1. Claude Code
2.1.287 ran **without bare mode**, using `--input-format stream-json`,
`--output-format stream-json --verbose`, `--strict-mcp-config --mcp-config`,
`--setting-sources project,local` and `--plugin-dir` pointing at the actual PR plugin.
Input stayed open across turns, so completion handling was driven by real tool notices,
not new user prompts or a substitute model polling loop. The owner supplied commit:no
and propose:no. Only fixture polls used interval 0.2 seconds, deadline 3 seconds and
request timeout 2 seconds; default 60-second/110-minute operating timing was not measured.

The successful main conversation was `72d8c02b-c00d-4ceb-9cd9-341d464d2068`;
watch ownership was `0ab164f8-5691-4696-8d97-453fbdeb9c32`. Its background tasks were
`bh6j0b7np` (idle), `bzlwusxdi` (work), and `bgv5s6p42` (post-work wait).
Actual PowerShell tool inputs included run_in_background:true and timeout:7200000.
After the idle notice it checked ownership and rearmed. After work it checked ownership,
requested a fresh keyless overview, checked ownership again, and dispatched the fixture
dev with the exact entry `{runId:"fixture-pipeline-run",entryId:"fixture-entry",slotId:"plan"}`.
The agent's outcome carried the exact receipt
`{runId:"fixture-agent-run",revision:1,stepId:"plan"}` returned by agent_next.
A fresh overview then returned a gate wait; the gate was left closed and the watch rearmed.
On the owner stop message, stop intent preceded --stop; a late idle result was discarded.
The saved task had already exited, so TaskStop reported no remaining task. The session
exited successfully after 36 fixture tool calls, with `.git/harness/` empty. No source-file writes,
commits, pushes, new-work head dispatches or gate approvals occurred.

A second main conversation, `68e45eb3-02ed-4a1a-9ab6-6687d0e85cd1`, exercised a
commit-required fixture step under commit:no. Its watch session was
`ef5b11e2-7e5c-43ad-951b-181ee7b9def3`; background tasks `bgbk9c40v` and `bv78ivyta`
covered initial idle and ready work. The agent passed the same exact entry and receipt
with outcome:handoff. The fresh overview returned `on:"handoff"`; Claude kept the step
open (`done:false`), withheld success, and waited for the owner's actual commit and
explicit continuation. It did not rearm. An owner stop message then closed only that
watch session, preserving the handoff. The fixture recorded 21 tool calls and no
success outcome, source edits, commits, pushes or gate approval. `.git/harness/` was
empty after stop. This validates the commit-policy pause, without claiming real terminal
permission-dialog or post-commit resumption coverage.

Claude's actual init event identified harness@inline 0.4.0 at
`C:/Users/hamso/AppData/Local/Temp/stagekeeper-local-watch-implementation/plugin`,
and exposed both harness:init and harness:watch. The loaded watch Skill used that root
for the real CLI commands; no plugin-root shell environment variable was supplied.
The complete effective personal verification package was inspected without starting a
review. A byte-identical project copy made the required unqualified Skill available
under the isolated settings configuration; Claude identified the personal copy's
precedence. Its SKILL.md SHA256 was
`3e787583d041c5f3e4388e1c8b4d4853074b0543d79010733cdd520bd4fc9c21`.

| Loaded local artifact | SHA256 |
| --- | --- |
| skills/watch/SKILL.md | 227640733ba9bac4a8bcb9e8f57a9259d6b80cfdbdd8da60810b93df4e64f758 |
| bin/harness-watch.mjs | 905721e46940e5763d71331b795a701a3d062d52b37b7db9da32c5341a504814 |
| lib/watch.mjs | 99ff524e0bacf4cd3d17d7de0f120518c9ae95af1b02bf25d3693d78dd260ff9 |
| skills/init/references/reconciliation-contract.md | a34359ddf906e9bf695255b77082768856668e97d2ba97455f44e57bb54cbd39 |

The first isolated session correctly refused to start when the required verification
Skill was on disk but not discoverable. Another attempt rejected an incorrectly shaped
fixture wait response as protocol-error and did not rearm; correcting the fixture to
the current `on:"gate"` contract produced the successful run above. Neither was bypassed
or counted as a passing session. A supplemental handoff attempt encountered sandbox
ECONNREFUSED before any fixture call and was retried with approved network access.
A reused fixture created by the offline sandbox also failed Git's ownership check;
the handoff pass used a fresh repository created by the same user running the CLI.
No global safe.directory or permission exception was added.

Local evidence and the disposable fixture driver are retained under
`C:/Users/hamso/AppData/Local/Temp/stagekeeper-watch-qa-20261003/` (the directory name is
a scratch label; the run timestamps are 2026-10-02). Model cost metadata is an estimate
for these short test conversations and does not establish production watch cost.
Allowed fixture tools were preapproved; actual unanswered terminal permission prompts,
hosted-cache installation, production behavior and long-duration timing remain release
acceptance work. The following procedure is retained for that broader acceptance.

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

Implementation commit/PR: PR #100 includes latest dev `495bd22`, its resolved 0.4.0
manifest and the token-reveal package expectation. Local checks, build and bounded
main-conversation/local-source acceptance establish dev integration readiness once
the final PR check workflow is green. Ready status does not claim all V1–V13 or
production readiness are complete; browser, hosted-cache and operating acceptance
remain explicit follow-ups. Dev merge subsequently completed at `0aec9ab`; release
promotion and deployment acceptance are not established by this report.
Deployment SHA/plugin installation path/actual loaded version: not observed yet.
No template reseed is required or claimed.

Dev integration is complete. For release promotion, promote main by fast-forward only
from verified dev. Stop existing watchers before updating. Inspect the real local source
or hosted cache's 0.4.0 bodies and restart the Claude session before acceptance.

Record the owner's local gate-open time, work-output time and next successful
agent_next local receipt time (runId/revision/stepId), plus server gate event as supporting
evidence without subtracting unverified clocks. Record the actual 110-minute idle and
rearm, policy/permission windows, HTTP/model calls, DB compute/cost and stop preventing
new requests. In-flight server effects and already dispatched agents are outside local
cancellation guarantees. No phone push, resident spawn or cross-device lock claim.

The proposal is completed on the user's code-implementation criterion; these pending
acceptance steps remain follow-up work in this active report. Automated tests are
implementation evidence, not proof of a successful production watch session.
