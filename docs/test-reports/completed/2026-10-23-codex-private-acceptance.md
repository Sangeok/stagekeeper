---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'regression'
report-size: 'standard'
test-levels: ['static','component','contract','integration','end-to-end','manual']
test-tools: ['Node.js','Codex CLI','PostgreSQL','headless Microsoft Edge']
created-at: '2026-10-23'
completed-at: '2026-10-23'
last-executed-at: '2026-10-23T13:00:58.500Z'
tested-revision: '64db9e966a2adf26f47544f1b7dd833556751d17'
owners: ['user:Sangeok']
related: ['docs/architecture/protocol.md','docs/architecture/verification.md','docs/test-reports/active/dual-client-runtime-report.md']
primary-area: 'harness/codex-runtime'
observed-environments: ['local | isolated native Windows foreground runtime | Codex 0.164.0; owner Node 22.13.1; bundled Node 22.23.3; PostgreSQL 18.6 | disposable owner and agent']
test-summary: 'pass: committed private templates and fresh-plan-to-final-acceptance Codex service cycle, including the null binding correction'
follow-up: ['docs/proposals/active/codex-dual-client-runtime-follow-ups.md']
---

# Codex committed private templates and fresh-plan acceptance

## Summary and Decision

The current candidate completed fresh plan generation, committed plan recovery,
independent verification, owner approval, implementation, committed report recovery
and all five final acceptance checks through the built HTTP service. The final board
contained `acceptedAt`. Unlike the earlier prepared-plan trial, this run began with
only a requirement and defective source, using a committed private template revision.

This is bounded local regression evidence. The aggregate release report remains
blocked; production seed, package publication and public main promotion were not run.

## Scope and Criteria

| ID | Contract | Required observation |
| --- | --- | --- |
| R1 | [Execution binding](../../architecture/protocol.md) | An absent optional run ID does not block first entry; another run or entry remains refused |
| R2 | Same protocol: commit handoff | Plan and report resume with confirmed bytes and the existing usage/run |
| R3 | Pipeline verification and acceptance | Actual independent verifier, owner gate, implementation tests and five acceptance checks agree |
| R4 | [Repository verification](../../architecture/verification.md) | Source checks, private tests and isolated candidate installation pass |

Controlled actual-private active-command stop/resume, physical clean Windows/minimum
setup, bidirectional Claude/Codex handover, optional QA/impl-verifier, operational
seed/rollback, published updates, deployment and C4 automatic watch are excluded.

## Test Target

The public source was clean when packaged as the unreleased 0.5.19 candidate.
Both manifests were incremented for the shipped runtime correction. The package has
2,225 inventoried files and the unchanged complete eight-file verifier; identities
are in E1. Later report-only commits do not change that tested package.

Private templates were reconciled onto their latest main and tested at
`7f34e7b0a4e6e302b8559f54ca4894ee78b8964f`. They were then merged through
[private PR15](https://github.com/Sangeok/harness-templates/pull/15); the resulting
private main tree equals the tested tree. This is repository adoption, not a
production template deployment.

## Preconditions and Test Data

A fresh loopback PostgreSQL database received all migrations and 13 real private
template rows. A disposable owner/project, agent and owner tokens, Git repository
and greeting function exercised the pipeline. The native existing Codex login was
used without copying credentials. Helpers used the installed owner Node; role
commands used the bundled Node/npm. No WSL or extra client login was required.

Headless Edge opened the authenticated Pipeline page against the production build.
This is not a repeat of the broader UI/browser suite. Each failed or successful
campaign removed its own fixtures and stopped its service/session.

## Test Matrix

| ID | Criterion | Gate | Measured result, E1 | Verdict |
| --- | --- | --- | --- | --- |
| T1 | R1 | required | Actual verifier sent `agentRunId:null`; corrected bridge accepted it and bound later calls to the issued ID. Regression rejects forged run/entry values. | PASS |
| T2 | R2 | required | Actual dev wrote a new plan. Owner-committed plan and report both resumed with unchanged artifact bytes and usage. | PASS |
| T3 | R3 | required | Root review: 44 cases, 25 killed mutants. Separate complete private verifier: five required paths, 23 killed mutants, zero defects; server records verify ok. | PASS |
| T4 | R3 | required | Real owner MCP gate approval; implementation snapshot passed all 45 tests without omissions relevant to this fixture. | PASS |
| T5 | R3 | required | Independent final test run: 45 pass. Replayed 44 planned input/output pairs and 65,536 UTF-16 code units; scoped diff, backlog removal, exact report and clean checkout agreed. All five acceptance checks and acceptedAt read-back passed. | PASS |
| T6 | R4 | required | Isolated plugin install discovered all four expected skills with matching bodies; 61 actual private delivery/render/init/handoff tests passed. | PASS |
| T7 | R3 | informational | Active-command stop/resume and broader host/handover/release scenarios listed above. | NOT RUN |

The final service cycle took 888 seconds. The finite string tests do not prove every
possible string; non-string behavior is explicitly unspecified.

## Commands and Static Checks

Suite counts overlap and must not be summed as a unique-test total.

| ID | Criterion | Gate | Command or method | Result | Verdict |
| --- | --- | --- | --- | --- | --- |
| C1 | R4 | required | Core/plugin suite with `node --test --test-concurrency=1`, same file patterns as npm test | 500 pass, 2 skip, 0 fail | PASS |
| C2 | R4 | required | npm run check, including lint, type and boundary checks | 194 script tests pass, 3 skip | PASS |
| C3 | R4 | required | npm run build | Production build completes | PASS |
| C4 | R4 | required | npm run verify:fsd and npm run verify:server | Both pass | PASS |
| C5 | R4 | required | npm run test:architecture | 148 pass, 2 skip | PASS |
| C6 | R4 | required | npm run test:web | 768 pass | PASS |
| C7 | R4 | required | npm run test:server | 155 pass, 2 skip | PASS |
| C8 | R4 | required | Isolated PostgreSQL migrations and server integration | 142 pass, no skips | PASS |
| C9 | R4 | required | npm run test:templates after Prisma generation | 61 pass | PASS |

C1–C5 ran after the bridge correction. C6–C9 ran on the same application/private
source before that plugin-only correction; E1 retains that earlier public revision.
Default suite skips retain their opt-in native/POSIX/built-manifest limitations.
The tested source also passed [check CI](https://github.com/Sangeok/stagekeeper/actions/runs/39955348525)
and [Windows runtime CI](https://github.com/Sangeok/stagekeeper/actions/runs/39955348695).

## Evidence Registry

| ID | Evidence | Retained location |
| --- | --- | --- |
| E1 | Public/private/package identities, checks, actual transitions, acceptance, failed trials and cleanup | [observations.json](../assets/2026-10-23-codex-private-acceptance/observations.json) |

Raw private bodies, credentials, account/session identifiers and model transcripts
remain outside the public repository. Raw successful and failed logs are retained
locally. Model token totals were not collected completely.

## Findings and Follow-up

Two fresh-plan cycles on the previous candidate passed plan handoff but failed the
verifier's first call. A direct live bridge request omitting the optional run ID
passed; the model supplied null, which the bridge forwarded into the server's
optional-string schema. The corrected bridge omits null binding fields and injects
the authoritative dispatch/latest response. Existing mismatch checks remain intact.

The first trial also corrected one fixture citation before independent dispatch.
A tracing setup attempt used an invalid Windows preloader path and stopped before
any model; its corrected retry still reproduced the product failure. Model-free
policy/native/complete-skill/thread checks passed but were not treated as role
acceptance. None of these failures was relabeled as a success.

Two local parallel whole-suite attempts failed separate pre-existing background
tests: acceptEdits fallback and a 30-second unconfirmed-settlement wait. The first
passed alone; the final full serial run passed both and every other test. No
background source was changed. These failed attempts remain in E1; the evidence
does not claim that every parallel host run is reliable.

Remaining release work stays in the [active follow-up](../../proposals/active/codex-dual-client-runtime-follow-ups.md)
and [aggregate runtime report](../active/dual-client-runtime-report.md).

## Test Data and Cleanup

All owned role/service sessions released and the isolated PostgreSQL instance
stopped. The final database contained zero users, projects and templates. Disposable
fixture Git repositories and raw evidence are retained locally.

All 16 original private files are byte-identical to their initial snapshot. This
task edited neither original checkout. Eight original public UI files changed
concurrently during the campaign; no restore was attempted and public byte equality
is not claimed. Work continued in isolated public/private worktrees.

## Conclusion

The scoped fresh-plan and committed-private-template acceptance is complete.
Release readiness remains a separate, open decision with the excluded gates above.

## Review Checklist

- [x] Required gates have measured results and retained evidence.
- [x] Failed candidates and local test failures remain visible.
- [x] Private content and credentials are excluded from public artifacts.
- [x] Data/session cleanup and original-worktree preservation are recorded.
