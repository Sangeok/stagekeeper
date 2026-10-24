---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'exploratory'
report-size: 'standard'
test-levels: ['contract','integration','manual']
test-tools: ['Node.js','Codex CLI','Windows PowerShell']
created-at: '2026-10-24'
completed-at: '2026-10-24'
last-executed-at: '2026-10-24T01:34:55.618Z'
tested-revision: '5ec3015d3e874c86a2bd624fd8bd336f6dc0eff5'
owners: ['user:Sangeok']
related: ['docs/proposals/active/codex-resident-runner-plan.md','docs/proposals/active/codex-dual-client-runtime-follow-ups.md','docs/test-reports/active/dual-client-runtime-report.md']
primary-area: 'harness/codex-native-resident-boundary'
observed-environments: ['local | Windows 11 Home 10.0.26200 x64, native login and disposable Git fixture | installed 0.5.20; Codex 0.164.0; operator Node 22.13.1 | test-only adapter and server responses']
test-summary: 'pass: installed common loop completed two native cycles and interrupted a third; fresh contexts, generation fencing and owned cleanup observed with synthetic lease/overview/receipt'
follow-up: ['docs/proposals/active/codex-resident-runner-plan.md']
---

# Native Codex cycles through the common resident loop

## Summary and Decision

The installed 0.5.20 runResident loop drove two completed native Codex model cycles,
then interrupted a third pending MCP call. Each cycle used a separate App Server
process and fresh ephemeral thread. The same local session and explicit commit/propose
policy persisted. Only one native cycle was active at a time.

The user confirmed that only the current PC is available. It has global Node, so this
trial does not satisfy the physical clean-Windows gate. This is additional bounded
C4B evidence, not a replacement for the environment requirement or a product feature.

## Scope and Criteria

| Surface | Actual or synthetic |
| --- | --- |
| runResident, App Server transport, file broker and local-session helpers | Actual modules from the installed package |
| Codex model, separate processes/threads, report writes/commits, interrupt and terminal events | Actual native Windows execution |
| Adapter wiring, lease replies, work overview and persisted receipt/cursor | Test-only fixture |
| Product server lease, full fresh-role orchestration, pipeline receipt and usage | Not exercised |

The operator loaded installed modules using existing Node 22.13.1. This was not a
Node-free installation test. Poll/branch intervals were shortened for the bounded
trial; no real 110-minute idle result is claimed. No owner gate, push or actual
pipeline outcome was exposed to the model.

## Source and Preconditions

All 2,225 installed files matched the previously accepted 0.5.20 inventory, source
5ec3015d3e874c86a2bd624fd8bd336f6dc0eff5. The four used runtime modules also matched
repository review base d332261d2810ae4e93fd4e1dfcb6224326a263c5 byte for byte.
The current runbook was read from a disposable checkout. Existing native login was
used; no authentication files were copied.

The named policy denied root access, allowed scoped reads and fixed report writes,
disabled shell/exec/nested agents/apps/hooks/memories/goals, and disabled other MCP
servers/plugins. Owner HARNESS_TOKEN, OPENAI_API_KEY and CODEX_HOME overrides were
excluded from the child environment. Each effective configuration was checked before
its model turn. External reads and product writes were refused.

## Test Matrix

| ID | Observation | Result |
| --- | --- | --- |
| T1 | First context received its private canary, read synthetic receipt cursor 0, wrote and committed only CYCLE-1.md | PASS |
| T2 | Second fresh process/thread received no prior canary, reported null, restored the same synthetic receipt id at cursor 1, and committed only CYCLE-2.md | PASS |
| T3 | A request through the first generation's bridge URL was refused during the second generation | PASS |
| T4 | Each completed cycle closed the process, cleared listeners, settled registered children and had zero active MCP handlers before the next start | PASS |
| T5 | Third native context entered probe_wait; stop retained ownership, early release and competing Claude start were refused, and late commit was refused | PASS |
| T6 | The actual common loop requested interrupt once and received interrupted; no new overview, result beat or model start occurred after stop | PASS |
| T7 | Final handler/child counts were zero and the owned local lock was released; process inventory found no remaining owned Codex/Node process | PASS |

The canary result is a bounded observation combined with separate process/thread
identities and controlled inputs; it is not a universal proof of model isolation.
The receipt was a fixture file. Its preservation does not prove server receipt,
AgentRun, approval or usage behavior.

## Counts and Regression

The loop started generations 1, 2 and 3, classified only 1 and 2, and kept maximum
concurrent native cycles at one. It made 63 synthetic lease beats, five synthetic
overviews and two result beats. There were three actual model turns; token totals
were not collected. No fourth run or post-stop result submission occurred.

The unchanged common-loop and resident-boundary regression suites passed 34 tests,
with zero failures or skips. These tests and the native trial are separate evidence.

## Evidence Registry

| ID | Evidence | Location |
| --- | --- | --- |
| E1 | Nine native observations, installed/source hashes, actual/synthetic boundary, loop counts and cleanup | [observations.json](../assets/2026-10-24-codex-native-cycles/observations.json) |

The operator script, private runbook fixture, actual thread/turn identifiers and raw
local logs remain outside public Git. Public evidence excludes credentials, model
transcripts, canary values, synthetic receipt ids and local user paths.

## Cleanup and Conclusion

All owned App Server processes and bridge handlers ended. Child registries were empty
before local release, and no session lock remains. Disposable source/evidence is
retained for reproduction. No product source, global CLI configuration, production DB,
private template or installed package was modified.

This expands BLK-C4R-01's native lifecycle evidence. C4B remains blocked on real
server-lease/fresh-role integration and minimum-install prerequisites; C4C's actual
110-minute idle and OS-specific acceptance remain open. No live resident support or
implementation-readiness clearance is claimed.
