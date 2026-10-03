---
name: harness-run
description: Run the Stagekeeper foreground pipeline from its current server state in Codex.
---

Read harness.json and docs/harness/codex-runbook.md before acting. Resolve the installed
package from this SKILL.md (three parents above this skill directory), verify its Codex
manifest/version and use that package's bin/harness-codex.mjs. Never assume a shell plugin-root
variable. Legacy /harness:init recovery advice means $harness-init here.

Confirm the old Claude/Codex main loop, watch and child roles have actually stopped before
a client switch. Reuse durable server approval, never old local commit/proposal permission.
Use the user's explicit current commit/proposal policy; ask only when it is absent.
Run `prepare --commit yes|no --propose yes|no`. A locked result is a refusal to start.
Record the returned session; all work uses that exact active foreground session and policy.
Check branch, remote, approved commit and local artifacts without reset, stash or auto-commit.

Run `next --session <id>` (optionally `--key <KEY>`). Read current board artifacts as required
by the runbook. Act only on the fresh Codex runtime echo and pipeline answer. For dispatch use
`dispatch --session <id> [--key <KEY>]`; the helper re-queries current binding and executes a
fresh App Server role with a minimal briefing. It never forks the parent history. Do not use
native default agents, another CLI, inherited parent conclusions or auto-approval as fallback.
Runtime permission failures are failed/blocked. Keep the independent verifier's complete skill.

Before verify dispatch, do your own required reconciliation round and record the selected
verification paths. Create a scratch JSON file with the sole field requiredVerificationPaths
(a nonempty string array) and pass its path as dispatch --briefing. The helper obtains the
current board's plan path/commit itself. Brief the independent reviewer with key, commit, location
and checks only. Append scout/audit reports yourself. After done re-query pipeline, never call
the completed role again to open a new run. Preserve receipt, entry and agentRunId unchanged.
Legacy null format and slots-v1 are distinct; missing/unknown item binding stops the cycle.

Wait at gate/cap/handoff and tell the owner what is actually pending. Roles cannot write Git
metadata; commit prepared artifacts yourself only with the stored actual commit permission,
otherwise ask the owner. After the actual commit and the owner's explicit continue use
dispatch --session <id> --key <KEY> --handoff-commit <commit>; no automatic commit is performed.
The helper checks the current Codex resume binding and the exact committed artifact.
An owner gate_approve
result's next advice is not dispatch authority: re-query next with Codex client and source
version. Do not approve gates yourself. Acceptance belongs to this main loop: reproduce all
five original runbook checks, write/commit the acceptance section only with actual permission,
then report_submit as main-loop. Never delegate acceptance to the implementation role.
If any of the five acceptance checks fails, call `acceptance_fail` once with its check
numbers and a note of at most 150 characters. Follow current commit permission for any
optional failure record. Tell the owner and wait for their item-page retry or reopen;
do not rerun acceptance until fresh `next` answers `accept`. This wait affects that item,
so other ready items may continue under the same active session and policy.

Before parent file writes or outcome/report submissions, check session via harness-session
--check and require owned + active + same client and stored policy. Bound callbacks after
stopping/replacement must not mutate. Stop with `stop --session <id>`, wait for all owned roles,
turns, requests and tools to settle, then `release --session <id>`. Never call legacy watch --stop
to release early. A quiescence-required result preserves the lock; do not erase it or steal it.
On error stop the cycle, retain unresolved ownership, and report the specific missing evidence.
