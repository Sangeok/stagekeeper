# Implementation verifier

`impl-verifier` is an independent, item-bound report agent on Pro and Max. The optional
`impl-verify` node goes between `implement` and `accept`, before `qa` when both are present.
Existing versions and default graphs remain unchanged. Add **Implementation check** in the
Pipeline editor for new items; `before-impl-verify` is optional. Claude Code runs it; the
Codex helper refuses it for now (see Rollout).

Entering the node records implementation completion as `done`, without recording acceptance.
impl-verifier re-reads the change in a fresh context and checks, in a disposable verification
copy, that the tests the plan promised fail when the change is reverted. It receives no previous
verdict and never judges whether the design is good — that stays with the gates. Only the main
loop accepts at `accept`, after its existing five checks. A failed or blocked verification leaves
the item unaccepted. The owner reopens implementation/planning through the existing board action,
which creates fresh entries, or explicitly retries in the current entry after fixing the
environment.

## Inputs and verification copy

The main loop prepares the copy before each dispatch, outside the repository:

- Clone the repository, detach at the implementation report commit and remove the copy's
  `origin` remote, so nothing in the copy can push to the owner's repository.
- Place it at `~/.harness/impl-verify/<repository directory name>-<hash>/<KEY>`, where the hash is
  the first eight hex digits of the sha256 of `git rev-parse --show-toplevel`. The runbook gives
  the command. A fixed home path keeps the location the same for every session and stays out of
  synced Desktop/Documents folders; an environment that syncs the whole home folder excludes it.
- Prepare dependencies so the workspace verify commands run in the copy. A link to a workspace
  package must point inside the copy, never at the original checkout. A failed preparation is
  still dispatched: impl-verifier reports `blocked` from its baseline run, and only that item waits.
- Brief only project, key, entry, the target commit and the copy path. Run the runbook's
  *Verifier tree check* around the dispatch. Remove the copy when the item no longer needs it,
  unlinking any junction or symlink first.

The owner registers the absolute path of `~/.harness/impl-verify` once in Claude Code's
`permissions.additionalDirectories`. impl-verifier's file tools then read the copy without
asking: a subagent follows the same additional directories, permission mode and allow rules as
the main session (measured with Claude Code 2.1.292 on Windows, 2026-10-08). Verify commands in
the copy ask or not by the owner's allow rules and sandbox settings, as for dev's verify commands
in the repository. In the default permission mode every `git -C <copy>` call asks, even a
read-only one; auto mode decides per call. Do not add a wildcard allow rule such as
`Bash(git -C <copy root>/*)`: in the same measurement it also matched
`git -C <copy root>/../../<another repository> rev-parse HEAD` and ran it without asking.
impl-verifier still calls the copy's Git as `git -C <copy>`, so every Git command names the copy.

## Checks and verdicts

`start` resolves the target commit itself — the last implementation report with an AgentRun from
the item's dev — and requires it to match the briefing and the copy's HEAD as full SHAs. It reads
the dev workspace's verify commands from `harness.json` and runs them once in the copy; a failing
baseline is `blocked`. `verify` then checks:

1. Scope: the plan commit must be an ancestor of the target; changes outside "Files to change"
   are recorded for acceptance check 1, not judged here.
2. Behavior: the changed code against the plan's "Current behavior" and "Implementation sketch".
3. Tests: the promised tests exist and assert the behavior.
4. Mutation check, for `feat` and `fix` items (the backlog item's `type`): revert the product files
   listed in the plan to the plan commit in the copy, confirm the copy changed, and run the verify
   commands. Promised tests must fail on an assertion. A load or compile failure is recorded and
   does not count; a feat that only adds new files skips the check. Restoring the target must pass
   again, or the result is `blocked`. `refactor` and `docs` items record the check as not applicable.

`ok` means no defect that breaks the implementation; hygiene defects are reported only. `failed`
means at least one such defect. `blocked` means a required check could not run.

## Authority and evidence

impl-verifier writes `docs/agents/impl-verifier/<KEY>.md` and inside the verification copy only.
It changes nothing in the repository checkout and has no owner, transition, approval, acceptance,
backlog mutation or nested-agent tools. Claude cannot scope `Bash` or `Write` to a path, so the
main loop fingerprints the working tree before dispatch and compares it, report excluded, when the
agent returns (runbook *Verifier tree check*). The main loop commits the report through the
existing handoff procedure.

`report_submit` from `impl-verifier` requires its bound open AgentRun, the canonical report path, a
commit SHA, the current `impl-verify` entry with the item `done`, and a completed implementation
report. The node completes only on a current-entry run closed after verify/ok and report/ok with
its bound report. Failed or blocked closure answers wait-on-impl-verify instead of repeatedly
dispatching; a run from an earlier entry never completes the node. While the graph has the node,
acceptance is refused until the cursor reaches `accept`. There is no schema change.

## Rollout and verification

The new server and plugin both require the `agents/impl-verifier.md` template row, so the order is:
seed the template rows, promote to main (server deploy and plugin version), then each owner updates
the plugin, reruns `/harness:init`, registers the verification copy directory, and only then adds
the node in the Pipeline tab. The watcher rejects an unknown wait, so a node added before the
plugin update stops that owner's watch.

Do not add the node to a project run from Codex yet. The Codex helper refuses the impl-verifier
dispatch with `codex-role-unsupported` before any role run starts, and `pipeline_next` keeps
answering the same dispatch. An item bound to a graph version with the node keeps it even after
the node is removed. Its exits are: continue the item from Claude Code, fix the environment and
explicitly retry, or reopen from planning and hold or discard once the plan is back in review —
removing any leftover verification copy.

To roll back while no graph uses the node, revert the server; template rows and the plugin can
stay, and the template row must stay while the new plugin is installed. When a graph version uses
it, the owner first saves a graph without the node, as for QA. Source changes do not deploy or seed
operating databases, and private template bodies never go into this public repository.

Run core, plugin, frontend, template and isolated database tests
(`npm run test:server:integration` with a `stagekeeper_test_*` database). A real model rehearsal in
a smoke repository measures the copy preparation, the agent's cost and how often items wait.
