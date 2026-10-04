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

[Agent role catalog](../../proposals/active/agent-role-catalog.md) remains an active, unimplemented Phase 2 proposal at the user's explicit request. Restoring this plan does not authorize implementing it.

Release promotion, operating DB changes, template seeding and external deployment require their existing stage prerequisites. Document completion does not establish those observations.
