---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'regression'
report-size: 'standard'
test-levels: ['contract','integration','end-to-end','manual']
test-tools: ['Node.js','Codex CLI','Claude Code CLI','PostgreSQL','Windows PowerShell','headless Microsoft Edge']
created-at: '2026-10-23'
completed-at: '2026-10-23'
last-executed-at: '2026-10-23T14:31:23.420Z'
tested-revision: '775772efd6163117809c33e13e070adba9a8cff7'
owners: ['user:Sangeok']
related: ['docs/proposals/active/codex-dual-client-runtime-follow-ups.md','docs/architecture/protocol.md','docs/test-reports/active/dual-client-runtime-report.md']
primary-area: 'harness/codex-runtime-followups'
observed-environments: ['local | native Windows, isolated installed profiles and loopback service | Codex 0.164.0; Claude Code 2.1.309; bundled Node 22.23.3; PostgreSQL 18.6 | disposable owner and agent']
test-summary: 'pass: actual private active-command stop through same-item final acceptance, bounded bidirectional CLI/browser handover, installed package update and limited template recovery'
follow-up: ['docs/proposals/active/codex-dual-client-runtime-follow-ups.md']
---

# Codex runtime follow-up acceptance

## Summary and Decision

An actual private dev role was stopped while its native pending command and child
were running. A new Codex session resumed the same AgentRun and receipt, reran the
verification commands, completed report handoff and reached all five final
acceptance checks. This closes the prepared-plan R3 scenario.

Separate native Claude/Codex trials preserved an open implementation receipt after
actual browser approval in both directions. Installed 0.5.18-to-0.5.19 updates,
bundled helper initialization and bounded private template rollback also passed.
These are local observations; the aggregate report and follow-up proposal remain
blocked on their broader host, release and C4 requirements.

## Scope and Criteria

| ID | Source | Required observation |
| --- | --- | --- |
| R1 | Follow-up R3, protocol stop/ownership | Live owned command stops before release; same item/run/receipt resumes through final acceptance |
| R2 | Follow-up R4, client handover | Native CLI calls and real browser approval preserve board/pipeline/open run/receipt/usage in both directions |
| R3 | Follow-up R1/R5, package delivery | Actual installed inventories and bundled helpers work without global Node on the subprocess PATH; modified generated files retain ownership |
| R4 | Follow-up R5, template recovery | Real private rows roll back atomically and restore a 12-row baseline while preserving unrelated data |

The R3 fixture starts from a prepared plan. Earlier fresh-plan evidence remains in
the [preceding report](2026-10-23-codex-private-acceptance.md). R4 intentionally pauses
at the open implement step: it checks resumption identity, not target-client
implementation or final acceptance. Its preexisting outcome ledger is empty and
remains empty. These cases use the before-implement gate; they do not repeat the
default pipeline's before-plan gate. Physical clean Windows, actual mixed-version
hosts, other operating systems, production deployment/publication and C4 are outside
this bounded report and remain required in the parent proposal.

## Test Target

The current public dev and tested private source are recorded in E1. Public runtime,
application, package, schema and script sources are unchanged from the previously
tested 0.5.19 package source. This task changes evidence and progress documents only.
The reused package has 2,225 inventoried files and the complete eight-file verifier.
Its hash, runtime hash and private source hash are retained in E1.

R3 runs the unmodified packaged foreground dispatcher against the production build
and real private templates. Instrumentation observes native spawn/settlement without
changing the package. R4 uses bounded native CLI main-loop probes connected through
the package MCP client and common session helpers; it does not certify Claude watch
or a Codex resident adapter.

## Preconditions and Test Data

A fresh migrated loopback PostgreSQL database held disposable owners, projects and
13 private template rows. Each service campaign had its own Git fixture. Existing
native client logins were used without copying credentials. The greeting fixture
contains a 60-second child command within the existing 120-second command limit.

Package updates use isolated client profiles and a local marketplace. The machine
has Node installed; only the subprocess PATH excludes it. A failed `where node`
check precedes bundled helper execution. Installed cache bodies, rather than a
manifest version alone, are compared with the package inventory.

## Test Matrix

| ID | Criterion | Gate | Observation, E1 | Verdict |
| --- | --- | --- | --- | --- |
| T1 | R1 | required | Root review: 44 concrete cases and 25 killed mutants; actual independent private verifier records verify ok | PASS |
| T2 | R1 | required | Actual pending parent and child alive; early release returns quiescence-required; competing common-session Claude start is locked | PASS |
| T3 | R1 | required | Native stopped/quiescent acknowledgement, interrupted turn, all owned command processes ended before release; same run/revision/entry and usage preserved | PASS |
| T4 | R1 | required | Fresh Codex session reruns npm test and the full 60-second command, resumes owner-committed report without byte/usage changes, and reaches acceptedAt | PASS |
| T5 | R1 | required | Independent acceptance: 45 tests, 44 planned pairs, 65,536 UTF-16 code units, fresh pending-command copy, scoped diff/backlog/report/clean-tree checks | PASS |
| T6 | R2 | required | Claude→Codex and Codex→Claude: source observes gate, browser approves, source opens run, quiescent release, target calls the same step; approval, identity and usage unchanged | PASS |
| T7 | R3 | required | Both native clients install 0.5.18 then update to 0.5.19; every one of 2,225 installed files matches its inventory; fresh Codex loader finds four skills | PASS |
| T8 | R3 | required | Actual installed PowerShell helpers initialize both clients against the private HTTP service, complete Codex connection, and preserve modified role bytes and ownership hashes | PASS |
| T9 | R4 | required | Actual previous private 12-row baseline: injected transactional seed failure restores all bytes; successful 13-row seed then limited restore deletes only introduced Codex runbook and preserves unrelated row | PASS |
| T10 | R1,R2,R3,R4 | required | Trial sessions/services cleaned; isolated DB has zero users/projects/templates/AgentRuns; PostgreSQL stopped | PASS |

R3 took 1,047 seconds and accepted at `2026-10-23T14:19:15.506Z`. Final handover
cases took 53 and 56 seconds. The installed-helper service case took 17 seconds.
Finite string cases do not establish correctness for every possible string.

## Commands and Static Checks

| Scope | Executed operation | Result |
| --- | --- | --- |
| R1 | Packaged Codex prepare/next/dispatch; common stop/release; guarded npm test and npm run test:pending; owner commit and fresh dispatch | PASS |
| R2 | Native Claude print mode and native Codex App Server; scoped pipeline_next/agent_next calls; authenticated Inbox approval | PASS |
| R3 | Isolated Claude plugin install/update and Codex plugin add; fresh loader discovery; installed harness.ps1 init and codex complete-init | PASS |
| R4 | snapshotTemplates, seedTemplates and restoreTemplates in serializable disposable DB transactions using actual private bodies | PASS |
| Documents | npm run docs:check and git diff --check | PASS |
| Static | npm run check, including lint, FSD/server boundaries, type generation/typecheck and script tests | PASS: 194 tests, 3 skips |
| Architecture | npm run test:architecture | PASS: 148 tests, 2 skips |

Operator scripts and their final hashes are retained in E1; raw scripts/logs stay
outside the public repository. No new runtime code was produced. The production
build and source checks from the preceding report apply to identical source bytes;
this document does not claim a new application build or full product test run.

## Evidence Registry

| ID | Evidence | Location |
| --- | --- | --- |
| E1 | Exact identities, bounded observations, failed trials, operator hashes and cleanup | [observations.json](../assets/2026-10-23-codex-runtime-followups/observations.json) |

Private template bodies, tokens, cookies, raw model transcripts, local account paths
and session identifiers are excluded. Model token totals were not fully collected.

## Findings and Follow-up

The first handover observer omitted the per-tool MCP authorization configuration
already present in the product dispatcher. Native Codex correctly refused the call.
The observer then waited a second time for an already-closed process. Its owned
processes, session and fixture were explicitly cleaned. A second trial captured the
MCP refusal and cleaned normally. Both failed trials are retained. The final observer
uses the product's explicit allowed-tool configuration, with shell execution disabled
and no permission escalation; it exposes no gate-approval tool. Both new trials passed.
No product change was needed for either observer issue.

The remaining minimum-install requirement needs a physically clean Windows host;
PATH isolation cannot satisfy it. Mixed-version physical-host ownership, supported
OS acceptance and approved operational release also remain open. C4A is complete;
C4B still requires the minimum-setup and real main-loop permission/commit contract,
then C4C requires actual 110-minute no-model idle and lifecycle acceptance. See the
[follow-up proposal](../../proposals/active/codex-dual-client-runtime-follow-ups.md).

## Test Data and Cleanup

All final local session locks are absent. The failed observer's scoped process tree
was stopped only after its native model process had ended. Each service removed its
own owner/project and template rows. The final isolated database contained zero users,
projects, templates and AgentRuns before PostgreSQL stopped. Raw successful/failed
fixtures and isolated plugin caches are retained. The original dirty public/private
worktrees were not edited by this task.

## Conclusion

The listed local regression criteria passed. The parent proposal stays pending and
blocked; this result does not close clean-host, mixed-host, release or C4 acceptance.

## Review Checklist

- [x] R3 follows the stopped item through actual final acceptance.
- [x] R4's identity-only boundary and empty outcome ledger are explicit.
- [x] Both failed observer trials and their cleanup remain recorded.
- [x] Actual installed bytes and private DB recovery were inspected.
- [x] Sensitive content is excluded; remaining parent gates stay open.
