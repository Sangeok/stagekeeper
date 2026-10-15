# Bundled reconciliation skill — harness contract v1

Stagekeeper's installed bundle includes the complete original
`skills/reconciling-proposals-with-codebase/` package, including every referenced file.
Packaging uses an owner-approved source; init does not download, synthesize or replace it.

## Supply and resolved loader

Read the installed bundle's `skills/reconciling-proposals-with-codebase/SKILL.md`
and its required supporting files. Confirm the actual Claude Skill invocation resolves
that compatible package; a same-named personal/project skill can shadow the bundle.
Do not overwrite conflicting packages during init. Record the winning absolute path and
bundle version/commit or package checksum, then repeat preflight after reconciliation.

An installed bundle missing this dependency is a Stagekeeper packaging failure: stop and
repair/update the complete Stagekeeper package. Do not require manual Node or verifier
installation as the user's default recovery. A source-only development checkout may use
an explicitly approved complete project/personal package, but that does not certify the
installed bundle or its actual winning loader.

## Preflight — inspect without starting a review

1. Resolve the actual `reconciling-proposals-with-codebase` skill available to this Claude
   Code session. Read its complete `SKILL.md` and the supporting instructions required by
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
then rerun `/harness:init`. Do not bypass verification or generate a replacement
skill during init. Recheck after the package changes and before a new review session.

This is a compatibility contract, not a claim that a particular unversioned personal skill
is supported forever. Plan reviewers still load and inspect their own resolved copy.
