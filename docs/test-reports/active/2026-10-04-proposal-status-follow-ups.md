---
status: "incomplete"
created-at: "2026-10-04"
---

# Proposal completion follow-ups

This document tracks remaining acceptance work after the completed proposals were archived on their code-implementation criterion. It records outstanding work and does not claim new runtime, private-template or deployment verification.

| Proposal | Completed evidence | Remaining work |
| --- | --- | --- |
| [Pipeline agent slots Core 1](../../proposals/completed/2026-10-04-pipeline-agent-slots.md) | PR #46 merged into dev; [2026-09-18 integration](../completed/2026-09-18-pipeline-slots-dev-integration.md) records actual local DB and browser acceptance | Reconcile the historical pipeline-done integration-test gap against current tests; decide CI inclusion for server/DB suites; establish private-template and operating-bundle provenance. These items were not newly executed during document cleanup |
| [Local watch executor Stage 1](../../proposals/completed/2026-10-03-local-watch-executor.md) | PR #100 merged into dev; recorded code and local smoke checks | Browser, hosted-cache, installed-plugin/deployment and operating-session acceptance remain in the [active report](2026-10-02-local-watch-executor.md) |
| [Acceptance failure path](../../proposals/completed/2026-10-04-acceptance-failure-path.md) | PR #102 and #103 merged into dev; recorded local tests | Private templates PR #7 was still OPEN at head 55f2d7d on 2026-10-04; production migration/plugin/server rollout, rendered template verification and operating watch observations remain unexecuted |
| [Codex dual-client basic source](../../proposals/completed/2026-10-04-codex-dual-client-support.md) | Public PR #104 and UI PR #106 merged into dev; recorded local checks, six PostgreSQL contracts and UI browser PASS | Private template changes remain uncommitted; actual model/CLI, installed package, private seed/rollback and mixed-host acceptance remain in the [active runtime report](dual-client-runtime-report.md). These gates and unimplemented C4 were transferred to the [active follow-up proposal](../../proposals/active/codex-dual-client-runtime-follow-ups.md) |

On 2026-10-04 the user superseded the earlier restoration instruction and requested deletion of the unimplemented agent role catalog proposal. The file was deleted; Phase 2 is no longer retained as an active plan. The user also requested completion of the dual-client proposal on its code-implementation criterion; runtime/deployment and C4 gates remain open above.

Release promotion, operating DB changes, template seeding and external deployment require their existing stage prerequisites. Document completion does not establish those observations.

The later user-authorized current-adapter trials are now recorded as T60–T66/E72–E78 in the runtime report. Role MCP execution and actual pending PM stop/common-lock exclusion were observed after an approval-policy fix. File-role execution is blocked by the native Windows root-read requirement, so full basic host acceptance and C4 remain incomplete. The private template working tree and production deployment were unchanged.
