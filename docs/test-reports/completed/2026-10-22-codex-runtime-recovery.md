---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'regression'
report-size: 'standard'
test-levels: ['static','component','contract','integration','end-to-end','manual']
test-tools: ['Node.js','Codex CLI','PostgreSQL','headless Microsoft Edge']
created-at: '2026-10-22'
completed-at: '2026-10-22'
last-executed-at: '2026-10-22T15:48:25.445Z'
tested-revision: 'b17bc678a95174fce9fa7a6c2dc9c18327edf4c6'
owners: ['user:Sangeok']
related: ['docs/architecture/protocol.md','docs/architecture/verification.md','docs/test-reports/active/dual-client-runtime-report.md']
primary-area: 'harness/codex-runtime'
observed-environments: ['local | isolated native Windows foreground runtime | Codex 0.163.0; owner Node 22.13.1; bundled Node 22.23.3; PostgreSQL 18.6 | disposable owner and agent']
test-summary: 'pass: Codex runtime recovery — committed handoffs, scoped file calls and the prepared-plan-to-acceptance service cycle passed'
follow-up: ['docs/proposals/active/codex-dual-client-runtime-follow-ups.md']
---

# Codex runtime recovery regression

## Summary and Decision

The repaired Windows foreground adapter completed actual model execution through the
service, including independent plan verification, owner gate, implementation, report
handoff and five-check acceptance. This is bounded local regression evidence. It does
not authorize release, production template seed or promotion of dev to main.

## Scope and Criteria

| ID | Contract | Required observation |
| --- | --- | --- |
| R1 | [Commit handoff and execution binding](../../architecture/protocol.md) | Resume the existing run with the committed artifact, without rewriting it or adding usage |
| R2 | Same protocol: native roles and tool fences | Valid overlapping/scoped calls succeed; stale, stopped, cross-project and forbidden calls remain refused |
| R3 | [Verification workflow](../../architecture/verification.md) | Source checks, real private templates and candidate installation pass |
| R4 | Pipeline acceptance contract | Independent reviewer evidence, owner approval, implementation verify, committed report and five acceptance checks agree |

Controlled active-command stop/resume in a real private role, physical clean Windows,
Claude cross-client handover, optional QA/impl-verifier, OAuth onboarding, published
updates and production deployment are outside this final cycle. The existing aggregate
release report remains blocked. Bridge/native stop tests are recorded separately.

## Test Target

An isolated branch from dev preserved the original dirty UI checkout. Public changes
are limited to CLI selection, a bound commit-handoff proof, queued role calls, local
project-argument normalization, typed missing-path errors, list-response parsing and
regression coverage.
The candidate retains the unreleased 0.5.17 version; it is not an update/cache release test.

The package contains 2223 inventoried files; its identity and complete
eight-file verifier checksum are in E1. Eight changed runtime/helper files were compared
with the tested source. Private templates came from the owner's working copy with this
task's isolated delta; they are not asserted to be a released private revision.

## Preconditions and Test Data

A fresh loopback PostgreSQL database received all migrations and 13 private template
rows. The fixture used a disposable project, owner/agent tokens, Git repository and
greeting function. Existing native Codex login was used without copying credentials,
requiring WSL or changing persistent PATH. The browser opened an authenticated Pipeline
page against the built service; this was not a repeat of the earlier full UI suite.

Earlier candidates generated the plan with a real model. The final candidate starts
with that corrected model-authored plan as a recorded handoff fixture. It does not
claim a second plan-generation turn on the final package. Fresh actual model roles
then resume the plan, independently review it, implement it and resume its report.

## Test Matrix

| ID | Criterion | Gate | Scenario and measured evidence | Verdict |
| --- | --- | --- | --- | --- |
| T1 | R1 | required | Plan and report handoffs preserve artifact bytes and usage; current run binding is reused; changed bytes/commit/run are refused. E1 and runtime regressions. | PASS |
| T2 | R2 | required | Overlapping HTTP calls execute serially; queued terminal outcomes are rechecked; stop cancels queued work and discards late output. | PASS |
| T3 | R2 | required | Bound project is accepted then removed before native backend invocation; another project and arbitrary extra arguments are refused. | PASS |
| T4 | R2 | required | Missing permitted file reads and directory lookups return -32004; new authorized writes use null hash. Existing-file overwrite and denied/read-only writes remain refused. | PASS |
| T5 | R3 | required | Unknown Windows wrapper is skipped; supported npm CLI identity/version is checked and selected. Actual install discovers four expected skills with matching bodies. E1. | PASS |
| T6 | R3/R4 | required | All private template tests pass; full independent verifier reports zero defects with evidence for all five paths. E1. | PASS |
| T7 | R4 | required | Real owner MCP approval, native implementation tests, committed report resume, backlog removal and acceptedAt read-back. Five acceptance checks independently reproduced. E1. | PASS |
| T8 | R4 | informational | Final cycle deliberately omits an active-command stop/resume scenario; deterministic bridge/native stop tests passed. | NOT RUN |
| T9 | R2/R4 | required | Backlog/board lists use an explicit object-list response contract. JSON/SSE empty and populated arrays pass; malformed lists and array-shaped pipeline responses fail. Real service lists are checked before dispatch and at acceptance. | PASS |

## Commands and Static Checks

Counts are separate suites and overlap; they must not be added into a unique-test total.

| ID | Criterion | Gate | Command or method | Result | Verdict |
| --- | --- | --- | --- | --- | --- |
| C1 | R3 | required | npm test | 469 pass, 2 skip, 0 fail | PASS |
| C2 | R3 | required | npm run check, including boundary checks, lint and type checks | 185 script tests pass, 3 skip; 3 pre-existing lint warnings, no errors | PASS |
| C3 | R3 | required | npm run build | Production build completes | PASS |
| C4 | R3 | required | npm run test:web | 741 pass, 0 fail | PASS |
| C5 | R3 | required | npm run test:server | 139 pass, 1 opt-in built-manifest check skipped | PASS |
| C6 | R3 | required | npm run test:server:integration with isolated PostgreSQL | 139 pass, 0 skip; migrations applied | PASS |
| C7 | R3 | required | npm run test:architecture | 136 pass, 2 skip | PASS |
| C8 | R2/R3 | required | Windows host command/Git tests, actual native runtime configured | 27 pass, 0 skip | PASS |
| C9 | R3 | required | npm run test:templates after Prisma generation | 60 pass, 0 fail | PASS |
| C10 | R4 | required | Independent acceptance npm test and explicit expected input/output replay | Implementation suite passes; all 45 planned assertions pass | PASS |

Default-suite skips include opt-in native/LPAC cases and a POSIX-only case. The native
host suite ran separately; Windows symlink privilege and the opt-in built-manifest
case remain bounded omissions. Final npm test/check/build include all runtime and
parser fixes; earlier server/web/DB/native results cover unchanged application and native
command/Git code. The final actual model cycle exercises the new file behavior.

## Evidence Registry

| ID | Evidence | Retained location |
| --- | --- | --- |
| E1 | Sanitized package/source identity, suite counts, installation, model transitions, acceptance and cleanup | [observations.json](../assets/2026-10-22-codex-runtime-recovery/observations.json) |

Raw role instructions, private template bodies, account/session identifiers, tokens,
cookies and raw model transcripts are excluded. Raw diagnostic and failed-candidate
logs remain in the local evidence directory. The private four-file patch is stored
outside the public repository and was applied to a baseline copy with normalized
content equality verified; its checksum is in E1.

## Findings and Follow-up

The original handoff repeated because the committed artifact was not carried into
the resumed role. Unknown CLI wrappers caused premature failure, and a single-active
request check refused legitimate overlapping tool calls. Real testing additionally
found the project-argument/schema mismatch and missing-report/permission ambiguity.
All have targeted regression coverage and final runtime evidence.

Earlier independent verification correctly found two fixture defects: insufficient
mutation coverage and a stale backlog-type statement. The fixture was corrected,
resubmitted and independently reviewed again. The earlier full cycle failed at its
first report read even though 45 implementation tests passed; it was stopped and
cleaned, not relabeled as a pass. Diagnostic setup mistakes and an old asynchronous
test expectation were corrected separately from product defects.
An intermediate file-only correction also failed at an absent parent-directory
lookup; the final correction handles read, directory list and search consistently.
The next candidate reached acceptance but rejected the service's valid empty backlog
array. The final client explicitly selects the list contract for backlog_list and
board_list; the watch/pipeline object contract and error validation remain strict.

Physical clean-host acceptance, published package update identity, controlled private
stop/resume and the broader cross-client/release gates remain in the
[runtime follow-ups](../../proposals/active/codex-dual-client-runtime-follow-ups.md).

## Test Data and Cleanup

E1 records zero fixture users, projects, board/backlog items, runs and templates after
cleanup; owned HTTP service, PostgreSQL and local session locks are stopped/released.
Test repositories, package candidates and logs remain as local evidence. No production
data, global Codex configuration, protected branch or remote reference was changed.

The original 16 private files were preserved byte-for-byte. Of 914 snapshotted public
files, only an independently edited frontend proposal changed during the task; this
work did not write to that original checkout. All fixes are on the isolated task
branch. Branch cleanup preserves its checked-out/unmerged commits and other dirty work.

## Conclusion

Every required regression row passes within the stated environment and prepared-plan
fixture boundary. The aggregate dual-client release verdict is unchanged. Adoption
requires the public commits and separate private template delta together; production
seed, deployment, merge and publication remain separate work.

Report metadata, relative links, verdict consistency and sensitive-data exclusions
were reviewed manually. This revision has no npm docs:check script.
