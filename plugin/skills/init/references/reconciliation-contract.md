# External reconciliation skill — harness contract v1

Harness currently depends on an owner-provided `reconciling-proposals-with-codebase`
skill. The project owner supplies an approved release or checkout of the complete package,
including every referenced file. Harness does not publish an installer or claim an upstream
download URL for that package. Do not substitute a similarly named package from a search.

## Supply and installation

Install that complete directory at
`.claude/skills/reconciling-proposals-with-codebase/` in the connected project, with
`SKILL.md` at its root. An existing personal or managed installation is also supported if
it resolves under the same unqualified name and satisfies the contract below. A copy in a
Codex-only skill directory does not establish availability in Claude Code.

These installation locations follow the [Claude Code skill documentation](https://code.claude.com/docs/en/skills#where-skills-live).
Check the effective installation: a higher-precedence skill can shadow the project copy.
Do not overwrite an existing package during init; have the owner reconcile conflicting
versions, then repeat preflight. Record the supplied version/commit or package checksum.

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
Ask the project owner to supply or repair the complete compatible package at the project
path above, then rerun `/harness:init`. Do not bypass verification or generate a replacement
skill during init. Recheck after the package changes and before a new review session.

This is a compatibility contract, not a claim that a particular unversioned personal skill
is supported forever. Plan reviewers still load and inspect their own resolved copy.
