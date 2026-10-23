---
status: "active"
stage: "running"
result: null
report-kind: "acceptance"
report-size: "standard"
test-levels: ["static", "integration"]
test-tools: ["prisma migrate status", "read-only PostgreSQL query", "git", "test source review"]
created-at: "2026-10-04"
completed-at: null
last-executed-at: "2026-10-23"
tested-revision: "dev dc03640; production main 7e6e733 for the read-only checks"
owners: ["user:Sangeok"]
related: ["docs/proposals/completed/2026-10-04-pipeline-agent-slots.md", "docs/proposals/completed/2026-10-03-local-watch-executor.md", "docs/proposals/completed/2026-10-04-acceptance-failure-path.md", "docs/proposals/completed/2026-10-04-codex-dual-client-support.md"]
primary-area: "proposals/acceptance-follow-ups"
observed-environments: ["production | shared Neon PostgreSQL | read-only Prisma and SQL queries | owner", "local | repository at dev | Windows, Node 22.13.1 | owner"]
test-summary: null
follow-up: []
---

# Proposal completion follow-ups

This document tracks remaining acceptance work after the completed proposals were archived on their code-implementation criterion. It records outstanding work and does not claim new runtime, private-template or deployment verification.

| Proposal | Completed evidence | Remaining work |
| --- | --- | --- |
| [Pipeline agent slots Core 1](../../proposals/completed/2026-10-04-pipeline-agent-slots.md) | PR #46 merged into dev; [2026-09-18 integration](../completed/2026-09-18-pipeline-slots-dev-integration.md) records actual local DB and browser acceptance | Reconcile the historical pipeline-done integration-test gap against current tests; decide CI inclusion for server/DB suites; establish private-template and operating-bundle provenance. These items were not newly executed during document cleanup. Status 2026-10-23: the user decided to include the server/DB suites in CI. The `check` workflow now runs `npm run test:server` and, in a separate `server-integration` job, `npm run test:server:integration` on a disposable PostgreSQL 18 service container. The other two items were checked on 2026-10-23, so nothing remains for this row. Pipeline-done tests: the 2026-09-18 report lists its 10 PostgreSQL tests as receipt CAS, audit atomicity, board serialization, stale human requests, sync, migration and templates, with no pipeline-done case; that is taken as the gap. Current `tests/server/integration` drives the transition on PostgreSQL in `backlog-add.test.ts` (same-run verify/ok and report/ok, then `advancePipeline` gives `done`, removes the backlog item as done, and a reopen clears it) and in `impl-verifier.test.ts` and `qa-verifier.test.ts` (done hands the item to the verifier slots). The refusals (a board status or another agent's run, a report without verify/ok, a done the graph did not produce) are tested only without a database, in `packages/core/pipeline/pipeline.test.mjs`, `src/server/pipeline/run-service.test.ts` and `src/server/pipeline/board-service.test.ts`; all of these run in CI. Provenance: the production template rows match templates `main` `71505fe` (see the acceptance-failure row). The installed Windows bundle `harness@stagekeeper-windows` 0.5.18 was packaged from `7e6e733` (its `windows-package.json`: 2,223 files, package SHA-256 `1ace8c0c4b3187c0bc29e0999b6e19274a7bd41c276d933fe03e785ae03336e3`), which contains PR #46 (`fc1879f`) |
| [Local watch executor Stage 1](../../proposals/completed/2026-10-03-local-watch-executor.md) | PR #100 merged into dev; recorded code and local smoke checks | Browser, hosted-cache, installed-plugin/deployment and operating-session acceptance remain in the [active report](2026-10-02-local-watch-executor.md). Status 2026-10-23: that report now records installed-bundle runs and a production banner observation; its V11 browser, V9 permission-window and V13 operating-timing checks remain |
| [Acceptance failure path](../../proposals/completed/2026-10-04-acceptance-failure-path.md) | PR #102 and #103 merged into dev; recorded local tests | Private templates PR #7 was still OPEN at head 55f2d7d on 2026-10-04; production migration/plugin/server rollout, rendered template verification and operating watch observations remain unexecuted. Status 2026-10-23: templates PR #7 merged on 2026-10-08, and #102, #103 and the `20261003000000_acceptance_failure` migration are in `main` (`7e6e733`). A read-only check on 2026-10-23 found the production migration history up to date (`prisma migrate status`, 29 migrations) and all 13 production template rows identical by LF SHA-256 to templates `main` `71505fe`, which contains #7. No rendered-template check or operating observation of a failed acceptance is recorded |
| [Codex dual-client basic source](../../proposals/completed/2026-10-04-codex-dual-client-support.md) | Public PR #104 and UI PR #106 merged into dev; recorded local checks, six PostgreSQL contracts and UI browser PASS | Private template changes remain uncommitted; actual model/CLI, installed package, private seed/rollback and mixed-host acceptance remain in the [active runtime report](dual-client-runtime-report.md). These gates and unimplemented C4 were transferred to the [active follow-up proposal](../../proposals/active/codex-dual-client-runtime-follow-ups.md) |

On 2026-10-04 the user superseded the earlier restoration instruction and requested deletion of the unimplemented agent role catalog proposal. The file was deleted; Phase 2 is no longer retained as an active plan. The user also requested completion of the dual-client proposal on its code-implementation criterion; runtime/deployment and C4 gates remain open above.

Release promotion, operating DB changes, template seeding and external deployment require their existing stage prerequisites. Document completion does not establish those observations.

The later user-authorized current-adapter trials are now recorded as T60–T66/E72–E78 in the runtime report. Role MCP execution and actual pending PM stop/common-lock exclusion were observed after an approval-policy fix. File-role execution is blocked by the native Windows root-read requirement, so full basic host acceptance and C4 remain incomplete. The private template working tree and production deployment were unchanged.
