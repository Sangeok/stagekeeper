---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'regression'
report-size: 'standard'
test-levels: ['contract','integration','end-to-end','manual']
test-tools: ['Node.js','Codex CLI','Claude Code CLI','PostgreSQL','Windows PowerShell','headless Microsoft Edge']
created-at: '2026-10-24'
completed-at: '2026-10-24'
last-executed-at: '2026-10-23T15:39:41.281Z'
tested-revision: '5ec3015d3e874c86a2bd624fd8bd336f6dc0eff5'
owners: ['user:Sangeok']
related: ['docs/proposals/active/codex-dual-client-runtime-follow-ups.md','docs/proposals/active/codex-resident-runner-plan.md','docs/architecture/protocol.md','docs/test-reports/active/dual-client-runtime-report.md']
primary-area: 'harness/windows-codex-runtime'
observed-environments: ['local | Windows 11 Home 10.0.26200 x64, isolated installed profiles and loopback service | Codex 0.164.0; Claude 2.1.309; bundled Node 22.23.3; PostgreSQL 18.6 | disposable owner and agent']
test-summary: 'pass: installed 0.5.20 fresh-plan cycle through both browser gates and final acceptance; Windows command parameter regression repaired; bounded native main-loop transport observed'
follow-up: ['docs/proposals/active/codex-dual-client-runtime-follow-ups.md','docs/proposals/active/codex-resident-runner-plan.md']
---

# Windows Codex gates and command recovery

## Summary and Decision

Installed 0.5.20 completed a fresh plan, independent private verifier, both real browser
owner gates, implementation, report handoff and all five final acceptance checks.
The cycle took 1020 seconds and accepted at `2026-10-23T15:39:21.401Z`.

The first 0.5.19 attempt failed at a verifier command refusal. Its exact rejected
arguments were not captured, and a separate same-plan verifier replay passed with
valid arguments. A direct native regression independently proved that `cwd: "."`
was incorrectly refused and parameter errors were presented as permission failures.
Those defects are fixed without changing the role's permission or isolation boundaries.
The initial refusal is not conclusively attributed to the dot-root defect.

## Scope and Criteria

| ID | Source | Required observation |
| --- | --- | --- |
| R1 | Parent default Windows reproduction | New plan; plan/verify/implement/accept; before-plan and before-implement browser approval; actual final acceptance |
| R2 | Observed native command defect | Exact dot-root request works; malformed bounds remain rejected with correctable MCP errors; ownership and access refusals remain fenced |
| R3 | Installed delivery | Both clients update from 0.5.19 to 0.5.20; every installed byte matches the inventory; bundled helper runs without global Node on PATH |
| R4 | C4B host contract preparation | Actual native completed/interrupted events, explicitly permitted report commit, stop fencing and owned cleanup in a bounded experiment |

R4 uses a test-only bridge and resident lock fixture. It does not implement a product
resident adapter, server lease, fresh-role orchestration or work-cycle restart. C4B,
C4C real 110-minute idle, physically clean Windows, mixed-version physical hosts,
macOS and operational release remain open. A Node-free subprocess PATH is not a
physically clean Windows host. Existing R3 active-command and R4 client-handover
evidence remains in the [previous report](2026-10-23-codex-runtime-followups.md).

## Test Target

Source `5ec3015d3e874c86a2bd624fd8bd336f6dc0eff5` includes the command fix, focused regressions,
runtime instructions and both 0.5.20 manifests. The freshly built service and actual
installed package were used together. The package contains 2,225 files, the unchanged
Node 22.23.3 runtime and the complete eight-file verifier. The private source is the
committed 13-row tree already merged through private PR #15. E1 records exact hashes.

## Preconditions and Test Data

An isolated migrated loopback database held disposable owners, projects, subscriptions
and private template rows. Each attempt used a new Git fixture. The final item started
at before-plan with no plan or AgentRun. Actual browser clicks opened both gates; agent
tools did not expose gate approval. Existing native login was used without copying
credentials. The independent parent review and fresh private verifier used separate
contexts and selected required paths 1 through 5.

## Test Matrix

| ID | Criterion | Observation, E1 | Verdict |
| --- | --- | --- | --- |
| T1 | R1 | before-plan waits on repeated next calls; no plan/run exists; browser Request plan opens the same pipeline | PASS |
| T2 | R1 | Actual dev writes a new plan; owner-committed artifact resumes without changing bytes or usage | PASS |
| T3 | R1 | Parent review: 43 specified cases, 28 killed mutants, 65,536 UTF-16 code units; actual complete private verifier records verify ok | PASS |
| T4 | R1 | Browser Approve implementation preserves pipeline and exact plan commit; dev implements and verifies; report handoff preserves bytes and usage | PASS |
| T5 | R1 | Independent acceptance: 12 test cases reported by the runner, 43 planned input/output pairs, UTF-16 replay, exact diff, backlog removal and committed report; acceptedAt persisted | PASS |
| T6 | R2 | Native dot-root regression failed before the fix and passed afterward; malformed/traversal/bounds inputs and ownership/access fences remain enforced | PASS |
| T7 | R3 | Actual isolated native Claude/Codex updates; all 2,225 files and four Codex skills verified; installed PowerShell helper used for final cycle | PASS |
| T8 | R4 | Real main-loop report commit and completed/interrupted terminal events; early release, competing client and late commit refused; process/bridge/lock settled | PASS, bounded |
| T9 | R1–R4 | Own services and sessions closed; zero test users/projects/templates/AgentRuns; PostgreSQL stopped | PASS |

The finite greeting test does not prove every possible string or application behavior.
The normal final cycle does not repeat the earlier active-command stop/resume scenario.

## Commands and Static Checks

| Check | Result |
| --- | --- |
| Focused native command/file/bridge tests with real bundled runtime | 27 PASS, 0 SKIP |
| Serial core/plugin suite | 501 PASS, 2 SKIP |
| npm run check | PASS; script tests 194 PASS, 3 SKIP |
| npm run verify:fsd and npm run verify:server | PASS |
| npm run test:architecture | 148 PASS, 2 SKIP |
| npm run build | PASS |
| npm run docs:check and aggregate report structural validator | PASS |
| Installed helper init/complete-init/prepare/next/dispatch | PASS against actual private HTTP service |

The source PR's required check and Windows runtime workflows also passed before the
report commit. Final-head checks and integration are tracked in [PR #219](https://github.com/Sangeok/stagekeeper/pull/219).

## Evidence Registry

| ID | Evidence | Location |
| --- | --- | --- |
| E1 | Exact source/package identities, failures, final observations, operator hashes and cleanup | [observations.json](../assets/2026-10-24-codex-windows-gates/observations.json) |

Raw private templates, model transcripts, credentials, local user paths and session
identifiers remain outside public Git. Complete model token totals were not collected.

## Findings and Follow-up

Exactly `.` now normalizes to repository-root cwd. Nested dot/traversal segments,
absolute paths and Windows special path characters remain refused. Invalid command
shape and timeout bounds return MCP -32602 with fixed guidance; actual ownership,
filesystem and runtime refusals keep the generic denial. No permission elevation or
new tool is introduced. Role instructions explain correction within existing bounds.

The initial failed cycle and passing original-plan replay are separate observations.
Operator setup/review generation mistakes are retained as operator failures. The
synthetic invalid-hash probe lock was removed only after verifying its exact root,
session, empty children and null poller, with the original metadata preserved.

The aggregate report validator also found a summary mismatch with retained historical
required failures. Its metadata and rationale now explicitly preserve that historical
failure verdict while identifying this scoped successful trial. No evidence row or
validation rule was weakened.

## Test Data and Cleanup

All attempt checkouts and isolated package caches remain available for reproduction.
Each service removed its own fixture and templates. Final database counts are zero,
all local session locks are absent, owned Next/Codex helpers ended, and the dedicated
PostgreSQL instance stopped. The original private dirty worktree was not modified.

## Conclusion

The current-PC Windows foreground criteria passed on 0.5.20. The parent proposal
remains pending/blocked for its distinct clean-host, release and live resident gates.

## Review Checklist

- [x] Both browser gates and the full fresh-plan cycle observed.
- [x] Independent verifier and five-check acceptance completed.
- [x] Initial failure and inconclusive causal attribution preserved.
- [x] Actual installed bytes and Windows isolation regressions checked.
- [x] Bounded main-loop probe distinguished from product resident support.
- [x] Sensitive content excluded and owned cleanup verified.
