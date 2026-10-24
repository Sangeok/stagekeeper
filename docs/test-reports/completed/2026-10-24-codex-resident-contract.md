---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'exploratory'
report-size: 'standard'
test-levels: ['static','contract','integration']
test-tools: ['Node.js','PostgreSQL','Windows PowerShell']
created-at: '2026-10-24'
completed-at: '2026-10-24'
last-executed-at: '2026-10-24'
tested-revision: '1eedf0de90d782763167a8c500f33ab1f19e7905'
owners: ['user:Sangeok']
related: ['docs/proposals/active/codex-resident-runner-plan.md','docs/proposals/active/codex-dual-client-runtime-follow-ups.md','docs/architecture/protocol.md']
primary-area: 'runners/client-permission-contract'
observed-environments: ['local | native Windows, disposable loopback PostgreSQL | PostgreSQL 18.6 | isolated DDL fixture']
test-summary: 'pass: 111 candidate-DDL observations; existing Claude rows preserved; legacy session-only deletion demonstrated as a rollout limitation'
follow-up: ['docs/proposals/active/codex-resident-runner-plan.md']
---

# Codex resident contract rehearsal

## Summary and Decision

The proposed Runner client/permission constraints passed 111 recorded observations
in actual PostgreSQL. Six existing Claude rows retained every original field and
received the default client. Codex requires resident/scoped, a branch and no autostart.
This is a candidate-DDL result, not a shipped migration or live resident acceptance.

The old server's session-only DELETE still succeeded inside a transaction that was
rolled back. A database constraint cannot replace client checks in the service.
All server readers/writers must therefore be upgraded before Codex resident activation.
Rollback must retain a compatible server while Codex rows remain.

## Scope and Criteria

The fixture used a minimal Project(id) table and replayed the repository's exact
20261020000000_runner and 20261022000000_runner_signin_stop migrations. It then applied
the proposed DDL in a transaction. It did not replay the complete application schema,
run Prisma migrate deploy, start the HTTP service or invoke a model.

The specification audit traced core enums, strict REST parsing, service operations,
Prisma constraints, helper response parsing, session ownership and the RunnerView to
runnerFacts to full/compact/project-list display path. Future implementation tests
are assigned to those destination surfaces in the C4B plan.

## Test Matrix

| Observation group | Count | Result |
| --- | --- | --- |
| Pre-migration six-row snapshot vs post-migration rows excluding new client | 1 | PASS; all original values preserved, client=claude |
| client claude/codex/future × mode session/resident × permission null/auto/allowlist/scoped × autostart false/true × branch null/present | 96 | PASS; expected allow/deny matrix |
| Null client, unknown permission, Codex working, waiting dirty/branch/missing reason, stopped error/stuck/plan/owner/signin | 11 | PASS |
| Legacy insert without client and subsequent allowlist update | 1 | PASS |
| Legacy auto permission and autostart overwrite of Codex row | 1 | PASS; CHECK rejects both |
| Legacy session-only DELETE inside rollback transaction | 1 | PASS as a negative finding; deletion succeeds, rollback restores row |

The 111 count is observation groups, not a Node test runner's registered test count.
Existing Claude null-permission semantics are preserved, including autostart's stopped
owner/signin rows. The Codex constraint explicitly checks IS NOT NULL, so SQL CHECK's
unknown result cannot admit a missing Codex permission.

## Findings and Contract Changes

- Add client only to Runner metadata. Preserve pipeline, receipt, token and usage identity.
- Treat only omitted client as legacy Claude; reject null and unknown REST values.
- Bind same-session requests and autostart host matching to the stored client.
- Return and validate Codex session/client/mode/permission binding; refuse missing or
  incompatible server support instead of continuing without a lease.
- Keep Codex manual resident/scoped and Claude's existing drain/autostart behavior separate.
- Upgrade all server readers/writers before activation; preserve a compatible server
  during rollback until Codex processes and retained rows are accounted for.

## Evidence Registry

The unchanged current core/REST/service/DTO/banner baseline also passed 65 tests,
with zero failures or skips. These tests describe the current Claude contract and
do not verify the proposed Codex service implementation.

| ID | Evidence | Location |
| --- | --- | --- |
| E1 | Exact candidate DDL; not installed under prisma/migrations | [candidate-migration.sql](../assets/2026-10-24-codex-resident-contract/candidate-migration.sql) |
| E2 | All 111 observations, source migration hashes, candidate hash, actual constraint definitions and cleanup count | [observations.json](../assets/2026-10-24-codex-resident-contract/observations.json) |

The operator script and database logs are retained outside public Git. Reproduction
requires an empty disposable database, the two identified source migrations, E1 and
the complete Cartesian matrix above. Synthetic values contain no user credentials.

## Cleanup

Both fixture tables were removed and public table count was zero. The dedicated
loopback PostgreSQL instance was then stopped successfully. No production database,
user login, private template or application source was modified.

## Conclusion

The candidate database contract passed. C4B readiness remains **clean pass not completed**:
clean-host/release prerequisites and the live lease/main-loop/fresh-role/cycle evidence
remain open. The existing bounded native terminal evidence is partial; this rehearsal
does not supply missing runtime evidence or complete BLK-C4R-01/02, C4B or C4C.

## Review Checklist

- [x] Preserved existing Claude rows and tested all declared combinations.
- [x] Recorded the legacy deletion limitation and its rollout consequence.
- [x] Separated DDL observations from planned service/runtime tests.
- [x] Recorded source identities and cleaned up the disposable database.
- [ ] Run the formal migration and actual REST/helper/display integration after readiness.
- [ ] Complete native resident lifecycle and OS-specific C4C acceptance.
