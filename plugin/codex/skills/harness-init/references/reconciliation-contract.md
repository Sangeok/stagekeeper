# Bundled reconciliation skill — harness contract v1

Stagekeeper's installed bundle includes the complete original
`codex/skills/reconciling-proposals-with-codebase/` package, including every referenced file.
Packaging uses an owner-approved source; init does not download, synthesize or replace it.

## Supply and resolved loader

The helper resolves its bundled directory first. Only when that directory is absent in
source development does it try `HARNESS_VERIFIER_SKILL_DIR`, then
`CODEX_HOME/skills/reconciling-proposals-with-codebase` (default `~/.codex/skills/`).
These fallbacks do not repair or certify an incomplete installed bundle. Keep Claude's
package intact; the two clients have separate bundled copies.

Read the complete bundled package and record its absolute path, bundle version/commit
or checksum. The plan-verifier helper stages that package into scratch, checks its full
checksum/file count against init metadata, and requires exactly that staged path in
actual `skills/list`; only that skill is activated. Do not overwrite conflicts during init.
An installed bundle missing the verifier is a Stagekeeper packaging failure: stop and
repair/update Stagekeeper, without requiring manual Node or verifier installation.

## Preflight — inspect without starting a review

1. Resolve the actual `reconciling-proposals-with-codebase` skill available to this Codex
   session. Read its complete `SKILL.md` and the supporting instructions required by
   its gate workflow. Missing files or an unavailable Skill invocation are a failed check.
2. Confirm it defines and requires the ordered gates INV-1 through INV-7 for a full review,
   checks claims against current code and verification evidence, and requires a final pass
   with no edits before declaring a clean result. Matching the name alone is insufficient.
3. Confirm a caller can restrict the review to read-only repository access: an independent
   reviewer returns defects and evidence instead of editing the plan. It must not require
   implementation, commits, repository writes, or nested agent dispatch to return a review.
4. Confirm citations require re-reading the current source, and unavailable required checks
   cannot be reported as a clean pass. Never invent a compatibility result for unread content.

All checks must pass before init writes files. If any fails, report
`Verification skill unavailable or incompatible: <specific missing requirement>` and stop.
Repair/update the complete Stagekeeper bundle (or reconcile the winning loader conflict),
then rerun `$harness-init`. Do not bypass verification or generate a replacement
skill during init. Recheck after the package changes and before a new review session.

This is a compatibility contract, not a claim that a particular unversioned personal skill
is supported forever. Plan reviewers still load and inspect their own resolved copy.
