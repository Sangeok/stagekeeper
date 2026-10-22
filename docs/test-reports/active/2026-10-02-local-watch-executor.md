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

## Operating observation — 2026-10-20 background session on Windows

This was an unattended smoke on localhost (`harness-watch-smoke`, a gate-free pipeline,
Windows bundle 0.5.12). It ran in a `claude --bg --permission-mode auto` session, and it is
not the V13 mathgic run.

The background session runs in an isolated worktree. Commits land on that worktree's branch,
not on the checkout's branch. The auto-mode classifier denied nothing. The worktree guard
refused 8 commands that it could not prove stay inside the worktree.

One of those refusals was the documented launcher itself: `powershell.exe … harness.ps1 watch …`
called from the Bash tool ("runs powershell in a plain command; … cannot be shown not to run
git"). The same command through the PowerShell tool ran 5 seconds later, and the session used
the PowerShell tool from then on.

Recorded only, by the owner's decision. The watch skill keeps allowing both shells. A resident
executor that runs `claude -p` in the checkout has no worktree guard.

## Runner status, Phase A — 2026-10-20 (automated) and 2026-10-21 (localhost smoke)

Proposal: `docs/proposals/completed/2026-10-21-runner-status-and-background-runner.md` (Phase A). The managed
watch now takes a per-project runner lease on the server (`POST /api/runner`), signals while it
polls, reports `working` before it hands out work, honours the web pause, and tells the server
when it ends stuck or in error. Plugin 0.5.13.

Automated evidence on branch `harness/runner-status`:

- Plugin: 15 new cases in `plugin/bin/harness-watch.test.mjs` run the real watch and session
  CLIs against a fake server that routes `/api/runner` apart from MCP. They cover lease start,
  busy (lock removed, exit 0), refusal, takeover, resend of a transient start with the same
  session, a server without the route (local lock only), signal before `pipeline_next`, pause
  (no `pipeline_next`, no stuck count), replaced, stop on stuck and error, a non-boolean lease
  record, the session check (`paused`, `server:"unreachable"`, 404, replaced), the release stop,
  and foreground sessions that never call the route. The existing watch tests pass unchanged.
- Server: lease rules without a database (`src/server/runners/runner-service.test.ts`), the REST
  judgement (`src/server/rest/runner-handler.test.ts`), and the isolated-PostgreSQL integration
  `tests/server/integration/runner-lease.test.ts` (7/7: real row-lock race, database-clock
  expiry, stopped rows, resends, pause, plan gate and downgrade, the migration's checks, the
  real route). Removing the two lock lines makes the race case fail.
- Web: banner model, render and loader cases; a one-off headless render of the real banner and
  project list at 1100px and 420px with compiled Tailwind showed every state without overflow.

### Localhost smoke A — 2026-10-20 16:25–16:36 UTC

Setup:

- The owner confirmed the migration first. `migrate status` listed only `20261020000000_runner`.
  The same SQL then ran in one transaction on the shared Neon database and was rolled back,
  with checks for the table, the six CHECK constraints, the cascading key and the new column,
  and with no project paused. The owner ran `prisma migrate deploy`, and the same checks passed
  on the applied schema.
- Server: dev (`653f367`) served from the junction worktree on port 3001 with
  `next dev --webpack`. Turbopack refuses a junctioned `node_modules` ("Symlink
  [project]/node_modules is invalid, it points out of the filesystem root"). Port 3000 belonged
  to another project and was left alone.
- Plugin: the 0.5.13 CLIs from the worktree, run directly against `harness-watch-smoke` (Max)
  with `--server http://localhost:3001`. These are the commands the watch skill runs. No Claude
  Code session ran them, and the board had no open items.

| Proposal step | Observed |
| --- | --- |
| 1. Start shows the runner | `--start --managed` returned `started`. Board: "Runner: watching in Claude Code on `BOOK-5K4693FRHA` · checked 1 min ago" with **Pause**. Under a minute shows as 1, as designed. Other tabs end the strip with "Runner: watching on …". |
| 2. A second clone gets `busy` | A second clone's start returned `busy` with holder `{mode:"session", host:"BOOK-5K4693FRHA"}`, exit 0, and left no lock files. The first clone's lock stayed. |
| 3. Pause and Resume | **Pause** changed the line to "Runner paused — it starts nothing new." with **Resume**. `--check` returned `"paused":true`. The server log showed three poller signals after the pause and no MCP request. After **Resume**, the line came back, and the next poll signalled and then called `pipeline_next`. |
| 4. Closing the window | The poller was killed without stop or release. Four minutes after its last signal, the board showed "No signal from the runner on `BOOK-5K4693FRHA` for 4 min." The second clone could then start, and the old session's `--check` returned `replaced`. |
| 5. Project list card | The card added "Runner: watching on `BOOK-5K4693FRHA`" under "Nothing open". |

After the steps, the second clone's `--stop` and `--release` sent the owner stop, and the
runner line left the board. The pause was cleared.

Findings:

- The killed poller left `poller` in the old clone's lock, and `--release` returned
  `quiescence-required`. This rule predates Phase A: a dead process does not prove that work
  settled. The lock was recovered by hand as the watch skill's section 6 describes. No role had
  been dispatched. A real closed window leaves the same lock. By the watch skill, the next
  start then reports `locked` (not run here).
- Each runner request took 5.6–7.5 s on this machine, and MCP requests took 5.6–9.0 s. The
  runner request makes several database round trips to the us-east-2 Neon database. The
  watch's 20-second request timeout covers this.
- A pg deprecation warning ("Calling client.query() when the client is already executing a
  query") appears on project pages. The owner's dev-server log on a branch without Phase A has
  the same warning, so Phase A did not introduce it.

Not yet observed:

- A real Claude Code session acting on `busy`, `paused` or `replaced`. The fixture CLIs prove
  the protocol, and this smoke proves it against the real server and web.
- A runner in the `working` state, including the 60-minute rule after the last agent activity.
  The board had no work to hand out.

## Runner Phase B spike — 2026-10-20 22:59 – 2026-10-21 00:35 UTC

Proposal: `docs/proposals/completed/2026-10-21-runner-status-and-background-runner.md`, Execution Plan Phase B
step 1. The spike measured the assumptions behind B-1, B-3 and B-4 before any Phase B code.

Setup:

- Claude Code 2.1.305 on Windows 11 with the installed 0.5.13 bundle. Each probe ran in a
  scratch repository whose `origin` is a bare repository on the same disk, so no push left the
  machine. The scratch folder was never trusted.
- The first `claude -p` used the default model. Mechanism probes used `--model haiku`. The
  estimated cost of all probes was about $0.7. This is the client-side API-price estimate, not a
  subscription charge.
- Process probes used small Node and PowerShell stand-ins in the session scratchpad. They are
  not committed. The documentation answers come from code.claude.com pages fetched on
  2026-10-21: headless, cli-reference, permissions, permission-modes, skills and tools-reference.

| Question | Observed |
| --- | --- |
| Stream-json fields | The `system`/`init` message reported `permissionMode: "auto"` for the default model and for haiku. The user's SessionStart hook events came before it. The `result` message carried `subtype`, `is_error`, `num_turns`, `total_cost_usd`, `terminal_reason`, `safety_stops` and `permission_denials`, a list of `{tool_name, tool_use_id, tool_input}`. Per the documentation, an unavailable auto mode starts the session in Manual without an error, so the init field is the check. |
| Cost of one start | "Reply with exactly: OK" cost an estimated $0.46 with the default model, because every user-scope plugin, MCP server and instruction file loads. With haiku it cost $0.012. |
| stdin | Without a redirect, `-p` waited 3 s and warned "no stdin data received in 3s". The runner must start it with stdin closed. |
| Plugin skill in `-p` | `claude -p "/harness:watch --once --session probe"` loaded the installed skill. In a repository without `harness.json` it ran the preflight and stopped with "Run /harness:init". |
| Project skill in an untrusted folder | `/probe-commit` loaded. A Git Bash parent rewrote the leading `/probe-commit` into `C:/Program Files/Git/probe-commit`, which is MSYS path conversion. The runner starts `claude.exe` directly, so only Git Bash test scripts need `MSYS_NO_PATHCONV=1`. |
| Commit without asking | Under auto, a skill that tells the model to commit got a commit (`a959868`) and no question. |
| `--settings` allow rules in an untrusted folder | Under `dontAsk`, `git commit` was denied ("running in don't ask mode") when there was no rule. With a `--settings` file allowing `PowerShell(git commit *)`, it ran. Read-only `git status` ran in both cases. |
| Push deny rules | Under auto with no deny rule, a push to the bare remote succeeded: the classifier allowed it. With `--disallowedTools`, each of `PowerShell(git push*)`, `PowerShell(git push:*)`, `PowerShell(git push *)` and `Bash(git push:*)` denied the push and listed it in `permission_denials`, and the ref did not appear. |
| Push variant | `git -C . push …` with `PowerShell(git push *)` pushed. The permissions page lists this gap, and auto mode allows pushing to the working repository by default. |
| Process-scoped push block | `GIT_CONFIG_COUNT=1`, `GIT_CONFIG_KEY_0=url.stagekeeper-push-blocked://.pushInsteadOf` and `GIT_CONFIG_VALUE_0=` (empty) made `git push origin …` and `git push <path> …` fail with "remote helper 'stagekeeper-push-blocked' aborted session". `git -c url.stagekeeper-push-blocked://.pushInsteadOf=x push` still failed, and `git fetch` worked. A remote with an explicit `pushurl` still pushed. |
| Detached lifetime | A Node child started with `detached: true, stdio: "ignore", windowsHide: true` and `unref()` kept running for 377 s after a Bash tool call ended. Started from a `claude -p` PowerShell tool call, it kept running for 335 s after `claude -p` exited. Both were stopped by hand. Closing an interactive Claude Code window was not measured. |
| Windows PowerShell 5.1 started detached | `powershell.exe` started by Node with `detached: true` did nothing: a script file and a one-line `Add-Content` both produced no output and no file. The same command as an ordinary hidden child ran. |
| Children when the resident dies | Node puts its ordinary children into its own job: the child saw flags `0x3c00`, which are kill-on-close plus breakaway and silent breakaway. Killing the stand-in resident with `taskkill /F` (no `/T`) ended a Node → Node → Node tree. With a real `claude -p` as the child, `claude.exe` ended, but the PowerShell tool shell and the process it ran survived and kept writing. They were orphans. |
| Job Object launcher | A Windows PowerShell 5.1 launcher compiled a small C# type. It creates a job with only `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, assigns itself, holds the resident's process handle and starts `claude.exe` (`UseShellExecute=false`, `CreateNoWindow`, stdin closed). With a real `claude -p` inside, killing the resident ended `claude.exe`, the hook processes, the tool shell and its process. With the Node → Node → Node stand-in inside, killing only the launcher ended the whole work tree and left the resident running. `claude.exe` ran normally inside a job without breakaway. |
| Starting from a skill under auto | A user-invoked project skill whose step starts a detached runner was denied: "[Unauthorized Persistence]". An ad-hoc prompt doing the same was denied as "[Auto-Mode Bypass]". A specific allow rule matching the quoted command (`PowerShell(node *start-resident.mjs*)`) let it run. A rule that did not match the quotes did not. This session's own auto classifier denied registering the logon task as "[Unauthorized Persistence]". The owner then switched to manual mode and approved it. |
| Logon task without elevation | The token was not elevated (`IsInRole(Administrator)` false). `Register-ScheduledTask` with an `-AtLogOn -User <user>` trigger and an `Interactive`/`Limited` principal succeeded. `Start-ScheduledTask` ran the action under `services → svchost → conhost --headless → node` in session 1, outside the Claude Code process tree. The task was stopped and unregistered. |
| Window of the logon action | A window detector recorded every new visible top-level window for 4 s after `Start-ScheduledTask`. The control task ran `node.exe` directly and opened a Windows Terminal window at +220 ms (plus a `PseudoConsoleWindow`). The `conhost.exe --headless node …` task opened no visible window. Both wrote heartbeats, both tasks were removed, and the control window closed when its process was stopped. |
| Toast | A WinRT toast under PowerShell's AppUserModelID showed and was found in `ToastNotificationManager.History`. That held when run directly, and when run as an ordinary hidden PowerShell child of a detached Node process. |

Decisions the owner made on 2026-10-21 from these results are recorded in the proposal:

- Add the process-scoped push block, and refuse to start when a remote has an explicit
  `pushurl`.
- Start and autostart through `!` commands that the skill shows.
- Run each `claude -p` inside a Job Object launcher.

Not measured:

- Closing an interactive Claude Code window. The `claude -p` exit stood in for it.
- The logon trigger at a real logon. Smoke B step 5 covers it.
- PowerShell, rather than Node, under `conhost --headless`.
- Classifier probes with the default model as the main model. Those probes used haiku.

## Runner Phase B — localhost smoke B, 2026-10-21

Proposal: `docs/proposals/completed/2026-10-21-runner-status-and-background-runner.md`, Verification Plan
"smoke B". Steps 1–4 and 7–13 ran 05:07–07:40 UTC. Step 5 found a defect, and its retest ran
12:15–12:28 UTC after the fix.

Setup:

- Server: dev `06e093f` (Phase B, #182 and #183) served from the junction worktree on port 3001
  with `next dev --webpack`. The database was the shared Neon database. Port 3000 belonged to
  another project and was left alone.
- Plugin: the Windows bundle installed from the local marketplace. Steps 1–4 and 7–13 used
  0.5.14 built from `06e093f`. The step 5 retest used 0.5.15 built from `4e8b7b9` (#185 and #184).
- Repository: `harness-watch-smoke` (Max). Its `.mcp.json` pointed at port 3001 only during
  the smoke, under `git update-index --skip-worktree`, and was restored afterwards. The pipeline
  was saved as Version 2 with a gate before Implement, so a run could stop at a known point.
  Automatic scouting stayed off. The backlog had ITEM-04 (`slugify` separator option) and
  ITEM-05 (`isSlug` accepts the `slugify` options).
- Runs: Claude Code 2.1.306, the default model (`claude-opus-5-5[1m]`), permission mode `auto`
  from the init message.
- Observation used the runner's own files (`.git/harness/background.log`, `background.json`,
  `runs/`), the Windows notification history for group `stagekeeper-runner`, the dev-server log,
  the board on the web and process listings. The watch scripts stayed in the session scratchpad.

| Proposal step | Observed |
| --- | --- |
| 9. Start from the skill's line, then close the window | An interactive Claude Code in a new Windows Terminal window ran the start line with `--server http://localhost:3001 --propose yes`. It printed `started` (session `b5b698d0`, 05:07:58), and the window was closed. The resident (`node` 42740) kept running and later served steps 1–3 and 11. |
| 13. Edit guard on the banner | During a run, the board line read "Runner: working in the background on `BOOK-5K4693FRHA` (`main`) · checked … · pause before you edit `main`". |
| 12. Paused run finishing | **Pause** was pressed during the first run (05:08–05:38, ITEM-04 plan and plan verification, 65 turns). The run ended, and at 05:39:17 the toast read "Runner paused — The run in progress finished. You can edit main now. Nothing new starts until you choose Resume." |
| 3. No new run while paused | No run started while paused, though ITEM-04 still had work. |
| 2. Uncommitted file | After **Resume**, an untracked `smoke-b-dirty.txt` held the runner. The toast read "Runner waiting on main — Uncommitted changes: smoke-b-dirty.txt. Commit or stash them, and it continues." The banner showed the wait. The file was deleted at 05:44:43, and the next run started at 05:45:56, about 73 s later. |
| 1. Web approval to acceptance, unattended | **Approve implementation** on the web was followed by a run 22 s later (05:50:14). That run took ITEM-04 through implementation (`15a7c0f`), acceptance (`d156d79`, `npm test` 50/50) and the doc audit (`b306fe7`) to Done: 41 turns, no denials, no question. |
| 11. Branch switch during a run | The checkout switched to `smoke-b-other` during a run. The runner ended the run 26 s later (06:03:50, "ended: the branch changed"), and the banner showed the branch wait. The toast read "Runner ended a run — The checkout switched to smoke-b-other during a run, so the runner ended that run. Switch back to main, and it continues." Switching back started the next run 7 s later. A second switch (`smoke-b-other2`) behaved the same. |
| 10. Killing the resident during a run | `taskkill /F` on the resident alone (no `/T`) during the run that started at 06:13:19 ended the whole tree under it, nine processes. Three minutes later the board read "No signal from the runner on `BOOK-5K4693FRHA` for 3 min." The next start (session `008437a2`, 06:33:14) cleared the dead lock and left no orphans. |
| 7. Logs and the result line | Each finished run has `runs/<id>.jsonl` and `<id>.meta.json`, and the result line ("done: 41 turns, 0 denied", "ended: the branch changed") reached `status`. All 73 runner requests in the dev-server log returned 200. |
| 8. No push | The run logs have no push attempt, and `origin/main` stayed at `68f6b3e`. The smoke repository's main is 10 commits ahead and was not pushed. |
| 4. Local stop | `--stop` during the run at 07:27:53 returned `stopping`. The runner stopped as `owner` at 07:28:49, and the runner line left the board. |
| 6. Free refusal | Not part of the smoke. The handler and integration tests cover it, and the smoke account stays on Max. |
| 5. Sign-in start | See below. Failed on 0.5.14 and passed on 0.5.15. |

Step 5 on 0.5.14: `--autostart-on` always failed with "Windows refused the sign-in task. Nothing
was changed." In `plugin/runtime/windows/autostart.ps1`, the variable `$action` is the same
variable as the parameter `$Action`, because PowerShell names ignore case. Its
`ValidateSet('register','unregister')` rejected the task action object with a
`ValidationMetadataException`, and the script's `catch` turned that into `autostart-failed`. No
test ran the script. #185 renamed the variable and added a Windows test that registers a task
through the script, reads it back from Task Scheduler and removes it. The test fails on the old
script. Both manifests went to 0.5.15.

Step 5 on 0.5.15:

- `--autostart-on --propose yes --server http://localhost:3001` registered
  "Stagekeeper runner 4bc8623e": `conhost.exe --headless powershell.exe … harness.ps1 background
  --start --from-autostart …`, a logon trigger for the user, `Interactive`/`Limited`, no time
  limit, and no second instance. `status` showed the registration and that the plugin path
  matched.
- The owner signed out and back in. The dev server was off, as planned. The task ran at sign-in
  (12:15:16, result 0). After five failed requests, the runner refused at 12:15:29 with the toast
  "Runner did not start — Five consecutive requests failed. Resolve the server or connection
  error before starting again." and left no process. The owner found the toast in the
  notification center but did not see it pop up.
- With the dev server up again, `Start-ScheduledTask` ran the task at 12:25:21. The task ended
  with result 0, and the `conhost`, `powershell` and `node` that started the runner exited. The
  resident outlived them (`node` 40468) and started as session `843f9447` at 12:25:45. The board
  read "Runner: running in the background on `BOOK-5K4693FRHA` (`main`) · checked 1 min ago ·
  starts at sign-in" with **Pause**.
- ITEM-05 was waiting at implementation, so a run started at 12:26:12. None of the ten processes
  under the resident (`powershell` launcher, `claude.exe`, MCP servers and their `conhost`) had
  a visible window.
- `--stop` and `--autostart-off` followed at once. The task was removed. The run ended in
  8 turns without work (see the stop finding below), and the runner stopped as `owner` at
  12:27:37.

Findings:

- A wait reaches the banner up to 60 s late. The runner reports `waiting` with its next signal.
  Follow-up (2026-10-22, plugin 0.5.17): a wait that starts or ends is reported within 1 s.
- The documented one-minute window (B-2 step 3) happened. During the second branch switch, the
  agent committed the ITEM-05 plan (`ee8385c`) on `smoke-b-other2` before the runner noticed the
  switch. The commit was later fast-forwarded into the smoke repository's main.
  Follow-up (2026-10-22, plugin 0.5.16): the runner now checks the branch every 2 s during a
  run, so the window is about 2 s. The 60 s signal is unchanged.
- A stop sent before a run's first session check ends that run without work. The run's main
  loop requires `lifecycle:active` (watch skill section 7) and ended with "the session check
  reported `lifecycle:stopping` … so I dispatched no agents and changed nothing" in 6 turns
  (07:27) and 8 turns (12:26). The runner counts it as a run without progress (`failures: 1`),
  then stops as planned, so the count has no effect.
- **Pause** that arrives just before a record leaves the record for the next run. The first run
  stopped before `validation_record`. The next run (05:45, 16 turns) found the round log ahead
  of the board, checked that the plan, code and tests were unchanged, and recorded the result.
- At the moment of step 10, the processes under `claude.exe` were MCP servers and no tool shell
  was running. That a tool shell dies with the resident rests on the spike. The killed run left
  `runs/<id>.jsonl` and `<id>.launch.json` and no `.meta.json`. Pruning removes the launch file
  with the log.
- A toast at sign-in is easy to miss. It went out 13 s after sign-in and was found only in the
  notification center. Follow-up (2026-10-22, plugin 0.5.17): a refused sign-in start is also
  reported to the server, and the banner names the reason.
- The web **Pause**/**Resume** control appears only while a runner exists or the project is
  already paused (`showsPauseControl`). An owner cannot pause before a start, and a start with ready work
  begins a run within the first cycle (27 s here). Follow-up (2026-10-22, plugin 0.5.17): with
  sign-in start on, an owner stop keeps the row as stopped until sign-in, so **Pause** stays.
- The classifier denied nothing in any finished run with the default model.

Not observed:

- The "interrupted run" wait notice. Both branch-ended runs left a clean tree, so it rests on the
  loop tests.

Cleanup: the smoke `.mcp.json` was restored and its `skip-worktree` flag cleared. The pipeline
was saved as Version 3 without a gate. Sign-in start is off, no runner is running, and ITEM-05
waits for dev on the board.
