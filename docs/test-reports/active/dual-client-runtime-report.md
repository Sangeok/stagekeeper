---
status: "active"
stage: "blocked"
result: null
report-kind: "acceptance"
report-size: "standard"
test-levels: ["static","component","contract","integration","manual"]
test-tools: ["Node.js","Codex CLI","Claude Code CLI","PostgreSQL","headless Microsoft Edge"]
created-at: "2026-10-03"
completed-at: null
last-executed-at: "2026-10-04T12:10:33.969Z"
tested-revision: "21a1d6eb66cd0e57f94cff87de14b485f321a21e"
owners: ["user:Sangeok"]
related: ["docs/proposals/completed/2026-10-04-codex-dual-client-support.md","docs/proposals/active/codex-dual-client-runtime-follow-ups.md","docs/test-reports/README.md","docs/test-reports/template.md"]
primary-area: "harness/dual-client-runtime"
observed-environments: ["local | disposable CLI/loopback MCP | Node.js v22.13.1/win32 | test owner","local | Ubuntu 26.04.1 LTS / WSL2 disposable native CLI | Node.js v22.13.1/linux; Codex 0.160.0 | test owner"]
test-summary: "fail: dual-client runtime — required runtime gates remain unresolved"
follow-up: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md"]
---

# Dual-client implementation and runtime report

<!-- stagekeeper:dual-client-runtime:v1 -->

## Summary and Decision

2026-10-04 WSL2 follow-up: the unchanged root-deny policy now passes bounded model-free read/scratch/protected-path probes on a dedicated Linux checkout. Session 11/11 and report 28/28 regressions pass. No inference was started; native Linux login, full actual verifier/approved resumption and C4 remain pending. [Linux host observations](../assets/2026-10-04-codex-wsl-host-preflight/observations.json). Earlier Windows blockers and historical verdicts remain valid for their recorded host/revision.

2026-10-04 actual current-adapter trials: per-tool MCP approval defect fixed; MCP execution and pending PM stop/common-lock exclusion observed. Windows 0.160.0 cannot execute the unchanged root-deny file policy, so basic host acceptance remains BLOCKED and C4 is NOT IMPLEMENTED. [projected actual observations](../assets/2026-10-04-codex-role-host-preflight/observations.json) records projected diagnostics, source hashes and 66048 reported tokens. Full DB/browser/installed-package/verifier and mixed-version acceptance remain open.

2026-10-04 document lifecycle update: the user completed the basic proposal on its source-implementation criterion. Remaining actual host, CLI, private deployment and C4 work is tracked in [the active follow-up proposal](../../proposals/active/codex-dual-client-runtime-follow-ups.md). That lifecycle-only update ran no runtime trials and preserved then-current metadata. The later actual trial rows below update execution metadata while retaining all historical rows.

C0 evaluates a disposable host/package/legacy-lock environment. It does not certify Codex production support or authorize deployment. Each execution appends evidence; historical PASS results are tied to their own recorded revision.

Decision: historical automatic approval candidate isolation FAIL; strict-profile/native alternatives BLOCKED. Following the user's further implementation instruction, C1–C3 product source, private templates and local contract tests are implemented. Actual product host isolation, approved cross-client resumption, operational private bundle seed/rollback and released package acceptance remain unexecuted. Source completion does not clear the runtime gates. Native user CLI is authenticated; access to auth differs under the outer sandbox account.

2026-10-04 follow-up: E70 imports the later isolated PostgreSQL contract results; the six
previously unexecuted tests passed without changing their source. E71 records the two
remaining UI implementations and actual React browser tests. Operational private seed,
released package and real installed CLI/model acceptance remain unexecuted; historical
FAIL/BLOCKED and source-only NOT RUN rows below retain their original run scope.

## Scope and Criteria

Included: C0 capability/package/legacy fixtures, bounded historical model trials, C1–C3 source and local regression/contract checks, and a new model-free App Server effective-config inspection. Excluded execution: production DB seed, actual C3 host/DB/browser acceptance, deployment and C4 automatic watch. The capability script itself sends no model turns.

The later follow-up adds isolated DB contract evidence from the fourth-pass campaign and
owner/banner UI browser evidence. The earlier exclusions describe that run's scope;
the integrated two-CLI/browser product flow is still NOT RUN.

| Criterion | Source | Scope | Interpretation | Success criterion |
| --- | --- | --- | --- | --- |
| R1 | docs/proposals/completed/2026-10-04-codex-dual-client-support.md | E1/E6/E7 C0 | MUST | Actual isolation/discovery plus legacy boundaries; unexecuted checks remain blocked |
| R2 | docs/proposals/completed/2026-10-04-codex-dual-client-support.md | C1–C3 source and acceptance | MUST | Preserve Claude, client/ledger/ownership contracts and safe generation; actual host/DB/package acceptance must be distinct |
| R3 | docs/proposals/active/codex-dual-client-runtime-follow-ups.md | Current role host, cancellation and C4 prerequisite | MUST | Actual file operations must execute under unchanged permissions before C4; preserve prior failures |

## Test Target

The current run uses disposable Git checkouts under the owned stagekeeper-c4-runtime temporary root and synthetic localhost MCP, calling the actual product dispatchFreshRole. Role instructions are test stubs, not private winning template bodies. Current HEAD is the tested baseline; source hashes in the artifact identify uncommitted changes.

Disposable roots and loopback MCP are runtime targets; the current repository/private working trees are source/test targets. User/global configuration and production DB are untouched. Existing user documentation changes are retained. The historical 2026-10-03 inspection used config/read only and started no model turn; the new actual trials are described separately above.

Fixtures are retained under %TEMP%/stagekeeper-dual-client-c0-20261003-a, -b, -c and -d. Model targets were -b/checkout and its sibling verifier scratch directories. The final model-free capability run used -d. CLI versions: Codex 0.160.0 and Claude Code 2.1.288. Public baseline is origin/dev 9675a3efdaf12bb7c419d11c4164beaa55c89821, branch harness/codex-dual-client-support; product source is uncommitted. Private HEAD remains 95ace9d70b63cc8598ab229e2fe1138467f11728 with separate local template/test changes. Source hashes below identify the tested working bodies, not a published revision.

## Preconditions and Test Data

A new empty absolute root, installed CLIs and an owner-provided complete verifier package are needed. Synthetic credentials stay in process memory. Actual model probes require authenticated CLI and separately bounded fixtures; no model turns are sent by this script.

Manual model trials used the normal user's logged-in CLI after the user selected CLI login. Only synthetic read/write canaries were used. Authentication was consumed through the native CLI; no credential store was copied or inspected. OS-only child environment still relies on native host authentication and managed policy. All-command policy denial is BLOCKED; it is not a passing kernel filesystem test.

## Test Matrix

| ID | Criterion | Gate | Scenario/method | Expected | Actual/Evidence | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1 | required | codex --version | Installed CLI observed | [E1] | PASS |
| T2 | R1 | required | claude --version | Installed CLI observed | [E2] | PASS |
| T3 | R1 | required | App Server config/read and skills/list | Isolated config and actual fixture skill path loaded | [E3] | PASS |
| T4 | R1 | required | Legacy watch second start | Existing owner retained byte-for-byte | [E4] | PASS |
| T5 | R1 | required | Legacy watch stop | Observe current stop behavior without treating it as host quiescence | [E5] | PASS |
| T6 | R1 | required | Codex CLI authentication prerequisite | Authenticated CLI for separately bounded native model probe | [E6] | BLOCKED |
| T7 | R1 | required | Actual verifier write/scratch/tool/nested/owner isolation | Real effective permission denials, not prompt compliance | [E7] | NOT RUN |
| T8 | R1 | required | Actual fresh context canary | Parent-only judgment absent from independent verifier | [E8] | NOT RUN |
| T9 | R1 | required | Actual complete owner verifier package load | Full package, relative files and winning revision/checksum | [E9] | NOT RUN |
| T10 | R1 | required | Dual manifest installed winning skill/helper body | Actual both-host package discovery and installation | [E10] | NOT RUN |
| T11 | R1 | required | Mixed-version stopping/quiescence/late release | Legacy/updated adapter and successor ownership protected | [E11] | NOT RUN |
| T12 | R1 | informational | Automatic Codex watch | C4 only: real wakeup/cancel and 110-minute no-model idle | [E12] | NOT RUN |
| T13 | R1 | required | codex --version | Installed CLI observed | [E13] | PASS |
| T14 | R1 | required | claude --version | Installed CLI observed | [E14] | PASS |
| T15 | R1 | required | Isolated Codex marketplace add / plugin add | Compatibility manifest installed without touching user configuration | [E15] | PASS |
| T16 | R1 | required | Isolated Claude plugin validate | Existing Claude compatibility manifest remains valid | [E16] | PASS |
| T17 | R1 | required | App Server config/read and skills/list | Isolated config and actual fixture skill path loaded | [E17] | PASS |
| T18 | R1 | required | Actual complete owner verifier package load | Full package resources and winning loader path/checksum | [E18] | PASS |
| T19 | R1 | required | Dual manifest actual winning skill/helper body | Codex body/helper loaded; Claude-only skill absent | [E19] | PASS |
| T20 | R1 | required | Legacy watch second start | Existing owner retained byte-for-byte | [E20] | PASS |
| T21 | R1 | required | Legacy watch stop | Observe current stop behavior without treating it as host quiescence | [E21] | PASS |
| T22 | R1 | required | Codex CLI authentication prerequisite | Authenticated CLI for separately bounded native model probe | [E22] | BLOCKED |
| T23 | R1 | required | Actual verifier write/scratch/tool/nested/owner isolation | Real effective permission denials, not prompt compliance | [E23] | NOT RUN |
| T24 | R1 | required | Actual fresh context canary | Parent-only judgment absent from independent verifier | [E24] | NOT RUN |
| T25 | R1 | required | Mixed-version stopping/quiescence/late release | Legacy/updated adapter and successor ownership protected | [E25] | NOT RUN |
| T26 | R1 | informational | Automatic Codex watch | C4 only: real wakeup/cancel and 110-minute no-model idle | [E26] | NOT RUN |
| T27 | R1 | required | codex --version | Installed CLI observed | [E27] | PASS |
| T28 | R1 | required | claude --version | Installed CLI observed | [E28] | PASS |
| T29 | R1 | required | Isolated Codex marketplace add / plugin add | Compatibility manifest installed without touching user configuration | [E29] | PASS |
| T30 | R1 | required | Isolated Claude plugin validate | Existing Claude compatibility manifest remains valid | [E30] | PASS |
| T31 | R1 | required | App Server config/read and skills/list | Isolated config and actual fixture skill path loaded | [E31] | PASS |
| T32 | R1 | required | Actual complete owner verifier package load | Full package resources and winning loader path/checksum | [E32] | PASS |
| T33 | R1 | required | Dual manifest actual winning skill/helper body | Codex body/helper loaded; Claude-only skill absent | [E33] | PASS |
| T34 | R1 | required | Legacy watch second start | Existing owner retained byte-for-byte | [E34] | PASS |
| T35 | R1 | required | Legacy watch stop | Observe current stop behavior without treating it as host quiescence | [E35] | PASS |
| T36 | R1 | required | Codex CLI authentication prerequisite | Authenticated CLI for separately bounded native model probe | [E36] | BLOCKED |
| T37 | R1 | required | Actual verifier write/scratch/tool/nested/owner isolation | Real effective permission denials, not prompt compliance | [E37] | NOT RUN |
| T38 | R1 | required | Actual fresh context canary | Parent-only judgment absent from independent verifier | [E38] | NOT RUN |
| T39 | R1 | required | Mixed-version stopping/quiescence/late release | Legacy/updated adapter and successor ownership protected | [E39] | NOT RUN |
| T40 | R1 | informational | Automatic Codex watch | C4 only: real wakeup/cancel and 110-minute no-model idle | [E40] | NOT RUN |
| T41 | R1 | required | Normal-user Codex CLI login status | Authenticated native CLI without copying credentials | [E41] | PASS |
| T42 | R1 | required | Native custom plan-verifier selection | Named role actually starts and enforces child restrictions | [E42] | BLOCKED |
| T43 | R1 | required | Fresh CLI workspace-write candidate | Repository read works, repository write denied, scratch write works | [E43] | BLOCKED |
| T44 | R1 | required | Fresh CLI automatic approval candidate | Repository is protected while only verifier scratch is writable | [E44] | FAIL |
| T45 | R1 | required | Fresh CLI strict named permission profile | Effective read-only repository and writable scratch without escalation | [E45] | BLOCKED |
| T46 | R1 | required | Strict profile with OS environment allowlist | Independent context without inherited parent or owner environment | [E46] | BLOCKED |
| T47 | R1 | required | Actual fresh context and minimum tool/owner restrictions | Complete E1 canary, minimum tools and independent verifier execution | [E47] | BLOCKED |
| T48 | R2 | required | Same open run across Claude/Codex and serialized response contracts | Preserve receipt/entry/run identity; Codex-only echo; malformed later step cannot commit | [E54] | PASS |
| T49 | R2 | required | Both init orders, modified-file lock preservation and shared managed session | No opposite-client damage; stopping holds lock and successor/late release is fenced | [E53] | PASS |
| T50 | R2 | required | Model-free effective-config inspection | Inherited other MCP/plugins disabled and shell-set values cleared; no model proof claimed | [E59] | PASS |
| T51 | R2 | required | Managed role parser, HTTP role bridge and approval refusal | Exact tools only; owner/stale/completed calls denied; unknown process death cannot certify active turn | [E60] | PASS |
| T52 | R2 | required | Seed/restore IO boundary | All validation precedes write; bounded restore preserves outside rows and rejects current-body drift | [E56] | PASS |
| T53 | R2 | required | Actual product role/model/kernel/fresh-context trials | Read succeeds, forbidden write/nested/owner tools denied, scratch works with complete verifier | [E62] | NOT RUN |
| T54 | R2 | required | Actual DB/browser bidirectional approved resumption | Same BoardItem/PipelineRun/open AgentRun, approved commit and caller usage across both clients | [E62] | NOT RUN |
| T55 | R2 | required | Actual product package/private atomic seed and rollback | Installed winning helper/body; both clients work; transactional deployment/limited recovery observed | [E62] | NOT RUN |
| T56 | R2 | required | Actual mixed-version host stopping and quiescence | Pending role/tool ends before ownership transfer; no successor cleanup | [E62] | NOT RUN |
| T57 | R2 | required | Six PostgreSQL tests at the 2026-10-03 source-only snapshot | Both client orders and formats preserve approved commit/run/receipt/usage; rollback and bounded restore work | [E65] | NOT RUN |
| T58 | R2 | required | Later isolated PostgreSQL contract execution | All six unchanged tests pass inside the fourth-pass 95-test suite; no deployed bundle or CLI claim | [E70] | PASS |
| T59 | R2 | required | Owner connection and shared banner selection | Correct owner command/Copy; setup-next/tab persistence and identity resets; selection has no mutation | [E71] | PASS |
| T60 | R3 | required | Current adapter first MCP execution before fix | Role-authorized agent_next executes under never escalation policy | [E72] | FAIL |
| T61 | R3 | informational | Current adapter MCP execution after per-tool fix | Only role-authorized MCP calls execute | [E73] | PASS |
| T62 | R3 | required | Current adapter functional filesystem host gate | Allowed repository read and scratch write execute; forbidden repository write fails | [E74] | BLOCKED |
| T63 | R3 | informational | Model-free sandbox execution preflight and cleanup | Unsupported role execution stops before a model turn and releases its settled child | [E75] | PASS |
| T64 | R3 | informational | Actual pending PM MCP cancellation and duplicate start | Preserve lock until terminal turn, refuse duplicate client, then release | [E76] | PASS |
| T65 | R3 | required | C4 prerequisite and automatic watch | Functional basic host acceptance precedes C4 implementation and 110-minute idle trial | [E77] | NOT IMPLEMENTED |
| T66 | R1 | informational | Final source/report regression and build | No source regression; immutable historical evidence and truthful active lifecycle | [E78] | PASS |
| T67 | R3 | informational | WSL2 unchanged-policy functional filesystem probe | Allowed read/scratch write execute; protected read and repository/Git writes fail | [E79] | PASS |
| T68 | R3 | informational | WSL2 current-source session/report regression | Session ownership and report tests pass on native Linux | [E80] | PASS |
| T69 | R3 | required | WSL2 actual model/full verifier and C4 prerequisite | Authenticated actual model/full verifier and approved resumption precede C4 | [E81] | BLOCKED |

## Commands and Static Checks

Explicit local gates below were executed. The new TS test requires its own command because existing npm test/check globs do not select it.

| ID | Reference | Gate | Command/method | Expected | Actual/Evidence | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | R1 | required | node --import tsx --test scripts/rehearse-dual-client-runtime.test.ts | Explicit local command result recorded without promoting C0 to product PASS | [E48] | PASS |
| C2 | R1 | required | npm run check | Explicit local command result recorded without promoting C0 to product PASS | [E49] | PASS |
| C3 | R1 | required | npm test | Explicit local command result recorded without promoting C0 to product PASS | [E50] | PASS |
| C4 | R1 | required | npm run build | Explicit local command result recorded without promoting C0 to product PASS | [E51] | PASS |
| C5 | R1 | required | Dedicated report validate-only | Explicit local command result recorded without promoting C0 to product PASS | [E52] | PASS |
| C6 | R2 | required | npm test | Core/plugin regression including new ownership/role/bridge paths | [E53] | PASS |
| C7 | R2 | required | npm run test:web | Server/UI response/ledger/pre-render/copy contracts | [E54] | PASS |
| C8 | R2 | required | npm run test:templates | Actual private graphs unchanged and all Codex sources rendered | [E55] | PASS |
| C9 | R2 | required | node --import tsx --test scripts/rehearse-dual-client-runtime.test.ts scripts/template-seed-query.test.ts | Explicit script tests outside normal glob | [E56] | PASS |
| C10 | R2 | required | npm run check; npm run lint after final helper change | Types/FSD/architecture/lib drift; no new lint warning | [E57] | PASS |
| C11 | R2 | required | npm run build | Fresh production compile/type/static generation | [E58] | PASS |
| C12 | R2 | required | node.exe %TEMP%/stagekeeper-role-config-inspect.mjs | Config maps really narrowed under native CLI; zero model turns | [E59] | PASS |
| C13 | R2 | required | validate_sdd_traceability.py proposal --strict | REQ–Task–verifier coverage preserved | [E61] | PASS |
| C14 | R2 | required | Dedicated report validate-only after append/read-back | Current report structure valid independently of runtime verdict | [E63] | PASS |
| C15 | R2 | required | Final explicit script tests and npm run check | Protected DB runner/report phase history and all type/architecture checks | [E64] | PASS |
| C16 | R2 | required | Final strict proposal trace and report validate-only | Saved final documents retain traceability and truthful runtime verdict | [E66] | PASS |
| C17 | R2 | required | Full regression after latest dev integration | check/unit/web/script/private-template gates preserve both client contracts and acceptance failure handling | [E67] | PASS |
| C18 | R2 | required | Production build after latest dev integration | Prisma generation and Next production build/type/static routes | [E68] | PASS |
| C19 | R2 | required | Saved PR evidence trace/report validation | Strict trace and report lifecycle/evidence remain valid; runtime readiness stays unresolved | [E69] | PASS |

## Evidence Registry

| ID | Kind | Safe evidence | Retention |
| --- | --- | --- | --- |
| E1 | C0 command/fixture | 2026-10-03T06:24:10.404Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; codex 0.160.0 | Inline; no raw log retained |
| E2 | C0 command/fixture | 2026-10-03T06:24:10.404Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; claude 2.1.288 | Inline; no raw log retained |
| E3 | C0 command/fixture | 2026-10-03T06:24:10.404Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; read-only config=true; fixture skill count=1; fixture skill SHA256=f9af1dbda174d2c9be64beedd1f36ceca2d22ce386e9cf66f0c1384b85dbd925; this does not measure role effective permissions | Inline; no raw log retained |
| E4 | C0 command/fixture | 2026-10-03T06:24:10.404Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; event=locked; existing lock unchanged=true | Inline; no raw log retained |
| E5 | C0 command/fixture | 2026-10-03T06:24:10.404Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; event=stopped; legacy state removed=true; new adapter must not reuse this stop as safe release | Inline; no raw log retained |
| E6 | C0 command/fixture | 2026-10-03T06:24:10.404Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; CLI not logged in; no credential copied | Inline; no raw log retained |
| E7 | C0 command/fixture | 2026-10-03T06:24:10.404Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; NOT RUN: production adapter unavailable; model/package/mixed-version evidence is required before downstream readiness | Inline; no raw log retained |
| E8 | C0 command/fixture | 2026-10-03T06:24:10.404Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; NOT RUN: production adapter unavailable; model/package/mixed-version evidence is required before downstream readiness | Inline; no raw log retained |
| E9 | C0 command/fixture | 2026-10-03T06:24:10.404Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; NOT RUN: production adapter unavailable; model/package/mixed-version evidence is required before downstream readiness | Inline; no raw log retained |
| E10 | C0 command/fixture | 2026-10-03T06:24:10.404Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; NOT RUN: production adapter unavailable; model/package/mixed-version evidence is required before downstream readiness | Inline; no raw log retained |
| E11 | C0 command/fixture | 2026-10-03T06:24:10.404Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; NOT RUN: production adapter unavailable; model/package/mixed-version evidence is required before downstream readiness | Inline; no raw log retained |
| E12 | C0 command/fixture | 2026-10-03T06:24:10.404Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; NOT RUN: C0 loader/legacy fixtures do not establish automatic watch | Inline; no raw log retained |
| E13 | C0 command/fixture | 2026-10-03T06:29:20.717Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; codex 0.160.0 | Inline; no raw log retained |
| E14 | C0 command/fixture | 2026-10-03T06:29:20.717Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; claude 2.1.288 | Inline; no raw log retained |
| E15 | C0 command/fixture | 2026-10-03T06:29:20.717Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; local marketplace exit=0; install exit=0; fixture root has no portable plugin.json | Inline; no raw log retained |
| E16 | C0 command/fixture | 2026-10-03T06:29:20.717Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; validator exit=0; fixture-only validation, not a real Claude model run | Inline; no raw log retained |
| E17 | C0 command/fixture | 2026-10-03T06:29:20.717Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; read-only config=true; fixture skill count=1; fixture skill SHA256=f9af1dbda174d2c9be64beedd1f36ceca2d22ce386e9cf66f0c1384b85dbd925; this does not measure role effective permissions | Inline; no raw log retained |
| E18 | C0 command/fixture | 2026-10-03T06:29:20.717Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; files=8; package SHA256=89f61697dbdd711d600c74221cbf3e4ac5fc60fd520c51c365ef8a0450b3bad6; matching loader count=1; source copied without rewriting | Inline; no raw log retained |
| E19 | C0 command/fixture | 2026-10-03T06:29:20.717Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; winning count=1; Claude-only exposed=false; final body SHA256=2cc3131c82b0aeaf213b78a36cda196932dab6601fab075c3aef197faa12ea7d; helper present=true; this fixture does not establish production package readiness | Inline; no raw log retained |
| E20 | C0 command/fixture | 2026-10-03T06:29:20.717Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; event=locked; existing lock unchanged=true | Inline; no raw log retained |
| E21 | C0 command/fixture | 2026-10-03T06:29:20.717Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; event=stopped; legacy state removed=true; new adapter must not reuse this stop as safe release | Inline; no raw log retained |
| E22 | C0 command/fixture | 2026-10-03T06:29:20.717Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; CLI not logged in; no credential copied | Inline; no raw log retained |
| E23 | C0 command/fixture | 2026-10-03T06:29:20.717Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; NOT RUN: production adapter unavailable; model/package/mixed-version evidence is required before downstream readiness | Inline; no raw log retained |
| E24 | C0 command/fixture | 2026-10-03T06:29:20.717Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; NOT RUN: production adapter unavailable; model/package/mixed-version evidence is required before downstream readiness | Inline; no raw log retained |
| E25 | C0 command/fixture | 2026-10-03T06:29:20.717Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; NOT RUN: production adapter unavailable; model/package/mixed-version evidence is required before downstream readiness | Inline; no raw log retained |
| E26 | C0 command/fixture | 2026-10-03T06:29:20.717Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; NOT RUN: C0 loader/legacy fixtures do not establish automatic watch | Inline; no raw log retained |
| E27 | C0 command/fixture | 2026-10-03T07:00:05.779Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; codex 0.160.0 | Inline; no raw log retained |
| E28 | C0 command/fixture | 2026-10-03T07:00:05.779Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; claude 2.1.288 | Inline; no raw log retained |
| E29 | C0 command/fixture | 2026-10-03T07:00:05.779Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; local marketplace exit=0; install exit=0; fixture root has no portable plugin.json | Inline; no raw log retained |
| E30 | C0 command/fixture | 2026-10-03T07:00:05.779Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; validator exit=0; fixture-only validation, not a real Claude model run | Inline; no raw log retained |
| E31 | C0 command/fixture | 2026-10-03T07:00:05.779Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; read-only config=true; fixture skill count=1; fixture skill SHA256=f9af1dbda174d2c9be64beedd1f36ceca2d22ce386e9cf66f0c1384b85dbd925; this does not measure role effective permissions | Inline; no raw log retained |
| E32 | C0 command/fixture | 2026-10-03T07:00:05.779Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; files=8; package SHA256=89f61697dbdd711d600c74221cbf3e4ac5fc60fd520c51c365ef8a0450b3bad6; matching loader count=1; source copied without rewriting | Inline; no raw log retained |
| E33 | C0 command/fixture | 2026-10-03T07:00:05.779Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; winning count=1; loaded path=codex-home/plugins/cache/stagekeeper-c0/c0-harness/0.0.1/codex/skills/harness-init/SKILL.md; Claude-only exposed=false; final body SHA256=2cc3131c82b0aeaf213b78a36cda196932dab6601fab075c3aef197faa12ea7d; helper present=true; this fixture does not establish production package readiness | Inline; no raw log retained |
| E34 | C0 command/fixture | 2026-10-03T07:00:05.779Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; event=locked; existing lock unchanged=true | Inline; no raw log retained |
| E35 | C0 command/fixture | 2026-10-03T07:00:05.779Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; event=stopped; legacy state removed=true; new adapter must not reuse this stop as safe release | Inline; no raw log retained |
| E36 | C0 command/fixture | 2026-10-03T07:00:05.779Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; Authentication not accessible in this execution context; verify outside the outer sandbox before concluding the user is logged out; no credential copied | Inline; no raw log retained |
| E37 | C0 command/fixture | 2026-10-03T07:00:05.779Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; NOT RUN: production adapter unavailable; model/package/mixed-version evidence is required before downstream readiness | Inline; no raw log retained |
| E38 | C0 command/fixture | 2026-10-03T07:00:05.779Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; NOT RUN: production adapter unavailable; model/package/mixed-version evidence is required before downstream readiness | Inline; no raw log retained |
| E39 | C0 command/fixture | 2026-10-03T07:00:05.779Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; NOT RUN: production adapter unavailable; model/package/mixed-version evidence is required before downstream readiness | Inline; no raw log retained |
| E40 | C0 command/fixture | 2026-10-03T07:00:05.779Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; NOT RUN: C0 loader/legacy fixtures do not establish automatic watch | Inline; no raw log retained |
| E41 | C0 command/fixture | 2026-10-03T07:03:40.550Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; Normal/escalated user context returned Logged in using ChatGPT. E6/E22/E36 were outer sandbox account observations: they establish inaccessible auth in that context, not user logout. Real model trials used native auth and completed; no auth file was copied. | Inline; no raw log retained |
| E42 | C0 command/fixture | 2026-10-03T07:03:40.550Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; Codex 0.160.0 exec --ignore-user-config --ignore-rules --ephemeral --json --sandbox workspace-write --cd <b>/checkout, with sandbox_workspace_write.exclude_tmpdir_env_var=true and exclude_slash_tmp=true. Model reported no custom role selection parameter on its available native tool; no child or write was performed. This blocks this tested tool surface, not every Codex product surface. Usage input=46168, cached_input=30720, output=191; native role and canary isolation remain unproven. | Inline; no raw log retained |
| E43 | C0 command/fixture | 2026-10-03T07:03:40.550Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; Fresh ephemeral exec, ignore-user-config/ignore-rules, agents.enabled=false, --sandbox workspace-write, cwd <b>/fresh-verifier-scratch, exclude_tmpdir_env_var=true/exclude_slash_tmp=true. All four read/write/scratch/environment tool commands were rejected by policy before execution. Usage input=51482, cached_input=44928, output=660. A model-reported denied write is not successful isolation when allowed operations never execute. | Inline; no raw log retained |
| E44 | C0 command/fixture | 2026-10-03T07:03:40.550Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; Same fresh probe with --approve-for-me instead of --sandbox. Actual tool command read the repository fixture, wrote FORBIDDEN_WRITE to <b>/checkout/fresh-repo-write-probe.txt and SCRATCH_WRITE to <b>/fresh-verifier-scratch/scratch-write-probe.txt; both bodies were verified from disk. Owner environment presence was false. Usage input=34070, cached_input=28160, output=481. This candidate violates the repository write boundary and is excluded from product implementation. No global permission cause is inferred from this bounded failure. | Inline; no raw log retained |
| E45 | C0 command/fixture | 2026-10-03T07:03:40.550Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; No --sandbox/--approve-for-me; --strict-config; default_permissions=c0-verifier; extends=:read-only; filesystem inline TOML table maps <b>/checkout=read and <b>/named-verifier-scratch=write; network disabled; agents.enabled=false; granular sandbox_approval=false/rules=true/mcp_elicitations=false/request_permissions=false/skill_approval=false; approvals_reviewer=auto_review. Every command rejected before execution: approval required by policy, but AskForApproval::Granular.sandbox_approval is false. Neither repository nor scratch probe exists. Usage input=51951, cached_input=33920, output=692. Earlier per-path dotted quoting was invalid config and is not runtime evidence; the executed trial used the corrected inline table. | Inline; no raw log retained |
| E46 | C0 command/fixture | 2026-10-03T07:03:40.550Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; Same named profile, cwd <b>/clean-verifier-scratch, native CLI launched by Node spawn with only OS key allowlist. No HARNESS_/OPENAI_/ANTHROPIC_/CODEX_ variables or NODE_OPTIONS forwarded. Read/write/scratch/environment commands again rejected before execution with the same granular approval error; clean-repo-write-probe and scratch-write-probe absent. Usage input=55525, cached_input=47872, output=682. Environment sanitation alone did not produce a usable verifier. No broader escalation was granted to turn this into PASS. | Inline; no raw log retained |
| E47 | C0 command/fixture | 2026-10-03T07:03:40.550Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; Fresh CLI runs were new ephemeral contexts without resume and their prompts omitted parent-only judgment; their tools did not complete the required functional checks. Native custom role was not started. Child minimum MCP/non-MCP allowlist, owner tool denial, nested agent denial and complete canary protocol therefore remain unproven. Package skills/list is discovery evidence only; it is not proof that a complete verifier ran. | Inline; no raw log retained |
| E48 | C0 command/fixture | 2026-10-03T07:03:40.550Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; Exit 0; 25 tests, 24 pass, 0 failures, 1 Windows file symlink privilege skip. Directory junction, path escape, report replacement/busy writer/failure cleanup, immutable completed-campaign preflight and environment sanitation checks passed. Executed after final TypeScript changes. | Inline; no raw log retained |
| E49 | C0 command/fixture | 2026-10-03T07:03:40.550Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; Exit 0 after final TypeScript changes; plugin/lib in sync; lint/FSD/typegen/type check; architecture 26 pass; project availability 18 pass. Existing tests/server/fixtures/src-clean-code-browser.tsx:18 unused _success warning remains; no new warning. | Inline; no raw log retained |
| E50 | C0 command/fixture | 2026-10-03T07:03:40.550Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; Exit 0; 264 pass, 0 failures, 0 skips. Existing core/plugin/server-contract test coverage, not a real dual-client acceptance run. No application/core/plugin code changed after this execution. | Inline; no raw log retained |
| E51 | C0 command/fixture | 2026-10-03T07:03:40.550Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; Exit 0; Prisma generate and Next production build completed with route output. No application/core/plugin code changed after build; later operational-script changes were covered by the final check/type validation. Not DB deployment or browser acceptance. | Inline; no raw log retained |
| E52 | C0 command/fixture | 2026-10-03T07:03:40.550Z; revision 9675a3efdaf12bb7c419d11c4164beaa55c89821; Exit 0 on the previous saved C0 report and again after this atomic evidence append/read-back. Structural validity is independent of required runtime FAIL/BLOCKED and does not certify readiness. | Inline; no raw log retained |
| E53 | C1–C3 local regression | 2026-10-03T08:16:42Z; baseline 9675a3efdaf12bb7c419d11c4164beaa55c89821 plus source hash below; npm test exit 0, 285 pass/0 fail/0 skip. Both init orders, concurrent init, dry-run, old hash preservation, common ownership/managed Claude watch and role guards tested. CLI/node/HTTP fixtures are not actual model or DB acceptance. | Inline summary; temporary local logs |
| E54 | C1–C3 server/UI contracts | 2026-10-03T08:16:42Z; npm run test:web exit 0, 540 pass/0 fail. Actual MCP serialized text/REST client payload, default Claude response preservation, entitled/fallback bundle, pre-render-before-commit, unchanged open run/receipt, Codex handoff projection, token-kind and rendered copy payload covered. No actual browser/DB acceptance. | Inline summary; temporary local logs |
| E55 | Private source regression | 2026-10-03T08:16:42Z; npm run test:templates exit 0, 32 pass/0 fail. Actual five private graphs compared to 95ace9d70b63cc8598ab229e2fe1138467f11728: IDs/requirements/edges unchanged. All entitled Codex stubs/runbook/server steps render; no full step leaks to TOML. Private source and test hashes below; not committed, pushed or seeded. | Inline summary; private bodies retained privately |
| E56 | Operational script contracts | 2026-10-03T08:16:42Z; explicit script test exit 0, 27 pass/0 fail/1 Windows file-symlink privilege skip. Directory junction/path-escape checks pass. Includes three seed/restore IO tests; does not exercise PostgreSQL transaction rollback. | Inline summary; temporary local logs |
| E57 | Source gates | 2026-10-03T08:16:42Z; npm run check exit 0: plugin/lib sync, lint/FSD, next typegen, TypeScript, architecture 26 pass and project-availability 18 pass. Final helper changes followed by npm run lint exit 0. Only pre-existing tests/server/fixtures/src-clean-code-browser.tsx:18 unused _success warning remains. | Inline summary; temporary local logs |
| E58 | Production build | 2026-10-03T08:16:42Z; direct npm run build exit 0: Prisma generated client, Next 16.3.3 compile/type check, 15 static pages and route output completed. An earlier redirected PowerShell command reported NativeCommandError for Prisma's stderr informational line despite complete build; direct rerun confirms native command exit 0. No deployment or DB seed. | Inline summary; no production artifact published |
| E59 | Actual model-free host config | 2026-10-03T08:16:42Z; native Codex 0.160.0 App Server config/read from disposable scratch; initial map overrides retained four inherited MCP names and a shell-set value. Narrowed TOML maps disabled all four other servers and configured plugins, cleared inherited shell-set values, and passed assertRolePolicy for doc-auditor MCP allowlist plus two-root deny/read fixture. Output effectivePolicy=PASS, disabledInheritedMcp=4, modelTurns=0. No thread/turn, file/tool denial trial, owner conversation or global write. | Reproduction script in owned Temp; safe summary only |
| E60 | Role transport and policy tests | 2026-10-03T08:16:42Z; node --test plugin/bin/harness-session.test.mjs exit 0, 10 pass. Managed TOML tampering refused; effective policy rejects extra write, owner MCP, nested permission, network and inherited values. Real loopback HTTP bridge returns only role tools and rejects owner/stale/post-done requests with matching JSON-RPC ID. Fake App Server approval refused; timeout/transport teardown bounded. These are control boundary tests, not kernel/model isolation evidence. Included in E53 final suite. | Inline summary; fixture-only transport |
| E61 | Proposal traceability | 2026-10-03T08:16:42Z; validate_sdd_traceability.py docs/proposals/active/codex-dual-client-support.md --strict exit 0: US1, REQ20, INV5, CON8, EX4, TASK13, BLK5; phase/task20/20 and verifier20/20. Source authorization updated without deleting required host/release blockers. | Inline summary |
| E62 | Remaining actual acceptance | 2026-10-03T08:16:42Z; NOT RUN: current product adapter model/kernel canary and full independent verifier, actual approved bidirectional DB/browser flow, new installed package, production/private seed transaction and bounded rollback, actual mixed-version pending host cancellation. C4 auto-watch NOT IMPLEMENTED and outside authorized source scope. Old E44 FAIL and E45–E47 BLOCKED remain history; no auto-approval fallback used. | Inline gap declaration |
| E63 | Current report structural validation | 2026-10-03T08:16:42Z; dedicated --validate-report-only after final evidence append/read-back exits 0. Overall required result remains fail from historical candidate failure plus unresolved actual gates; active/result:null preserved. Structure validation is not support readiness. | Inline summary |
| E64 | Final operational/type gates | 2026-10-03T08:35:23Z; node --import tsx --test scripts/rehearse-dual-client-runtime.test.ts scripts/template-seed-query.test.ts exit 0: 30 tests, 29 pass, 0 fail, 1 Windows file-symlink privilege skip. Acceptance runner tests use injected IO; no actual DB/model command runs in them. First-acceptance report criterion omission and contradictory scope were caught and fixed; phase history works in both orders. Final npm run check exit 0: typegen/TypeScript/FSD/lint/lib sync, architecture 26 and availability 18 pass; only the existing _success warning. Application/core/plugin bodies remain unchanged since E53–E58; later operational script and DB-test sources are covered by this final check. | Inline summary; working source retained |
| E65 | Actual DB acceptance gap | 2026-10-03T08:35:23Z; tests/server/integration/client-runtime.test.ts contains six actual PostgreSQL tests and type-compiles: legacy/slots-v1 times both client orders, preflight-before-lazy-mutation, transactional seed rollback/bounded restore. TEST_DATABASE_URL is absent, so neither test DB migration nor these tests were executed. Source SHA256 7a7dedc35811a6ad5ab4bb8f212f1579b61eeb54f1c53b1431de35a0cda007ff. New --phase acceptance requires a prepared separate dual checkout and protected stagekeeper_test_* DB, strips parent credentials, records TAP totals only and keeps actual CLI/browser/package gates NOT RUN. | Inline explicit non-execution; test source |
| E66 | Final saved document validation | 2026-10-03 final save/read-back: strict proposal validator exit 0, REQ20 phase/task20/20 and verifier20/20. Dedicated report --validate-report-only exit 0; current active/result:null and required fail verdict retained. Public/private git diff --check pass. Structural/source validation does not release host, DB or deployment blockers. | Inline summary |
| E67 | Committed latest-dev integration | 2026-10-03T09:55:52Z; source revision 7d8dd35137553d429dbd57c2241424c768aa4530 incorporates origin/dev a6ea1991bac069e2e7b1fa041d24739fd9c09ac6. Four conflicts resolved preserving Codex client schema and dev acceptance-failure behavior, both protocol sections and plugin 0.5.0. Codex main loop now records acceptance_fail and waits for owner retry/reopen before fresh accept. npm run db:generate/check exit 0, architecture26/availability18 pass; npm test 286 pass, test:web554 pass, private templates32 pass, explicit script tests29 pass/1 privilege skip/0 failures. Existing _success warning only. No DB migration/model or production action executed. | Commit source; inline safe local results |
| E68 | Integrated production build | 2026-10-03 after E67 source regression; npm run build exit 0 with Prisma7.10 generation, Next16.3.3 compile/type validation, 15 static pages and complete route output. Uses current dev schema including additive acceptance failure migration but executes no migration/DB seed. | Committed source; build result only |
| E69 | PR evidence read-back | 2026-10-03 saved PR evidence: strict proposal validator exit 0 with phase/task20/20 and verifier20/20; dedicated report validate-only exit 0; staged diff whitespace check passes. Historical candidate FAIL and required real host/DB/package NOT RUN remain intact, active/result:null retained. | Inline summary; source PR does not certify release |
| E70 | Later isolated DB contracts | 2026-10-04 fourth-pass campaign: npm run test:server:integration passed 95/95, including client-runtime tests 44–49: both client orders times legacy/slots, preflight-before-mutation, transactional seed rollback/bounded restore. Source SHA256 remains 7a7dedc35811a6ad5ab4bb8f212f1579b61eeb54f1c53b1431de35a0cda007ff; e354854 retains that exact test source. Original TAP log inspected locally; production/private deployment and CLI/model/browser full flow not exercised. | [Fourth-pass report](../completed/2026-10-04-src-clean-code-fourth-pass.md), unchanged tests/server/integration/client-runtime.test.ts |
| E71 | Remaining UI implementation/acceptance | 2026-10-04 source e3548546076f279ddbf1e22e2a5ec563fd0a6e9e: owner Codex choice uses explicit token-free harness_owner registration; banner owns shared local selection across setup/work/tab changes and resets on slug. npm run check/build pass, test:web559/core-plugin286 pass, browser28/28 pass. No MCP registration, model, DB migration/seed or deployment executed in this UI follow-up. | [UI acceptance report](../completed/2026-10-04-codex-dual-client-ui.md), [browser results](../assets/2026-10-04-codex-dual-client-ui/browser-results.json) |
| E72 | Actual current adapter/manual host | 2026-10-04T11:48:55.423Z; revision 6837fe73e802e8c833c335b1dc740acccf814975; Actual doc-auditor model on 2026-10-04T11:41:13.494Z: zero remote calls; model reported MCP approval required under never. The adapter defect was fixed after this failed trial; failure history retained. Reported tokens 22781. [projected actual observations](../assets/2026-10-04-codex-role-host-preflight/observations.json) | Inline; no raw log retained |
| E73 | Actual current adapter/manual host | 2026-10-04T11:48:55.423Z; revision 6837fe73e802e8c833c335b1dc740acccf814975; Actual doc-auditor model on 2026-10-04T11:45:07.278Z: agent_next plus bound outcome executed with client codex, done true; owner/nested tools unavailable. This is MCP execution evidence only, not filesystem PASS or winning private role/verifier acceptance. Reported tokens 38646. [projected actual observations](../assets/2026-10-04-codex-role-host-preflight/observations.json) | Inline; no raw log retained |
| E74 | Actual current adapter/manual host | 2026-10-04T11:48:55.423Z; revision 6837fe73e802e8c833c335b1dc740acccf814975; Actual post-MCP-fix model: read, scratch write, forbidden repository write all refused before process launch: elevated Windows sandbox requires effective :root read access. No protected write observed, but allowed operations also failed. BLOCKED, not successful filesystem isolation. Same-version upstream validation confirms incompatibility. [projected actual observations](../assets/2026-10-04-codex-role-host-preflight/observations.json) | Inline; no raw log retained |
| E75 | Actual current adapter/manual host | 2026-10-04T11:48:55.423Z; revision 6837fe73e802e8c833c335b1dc740acccf814975; Actual final worktree adapter: effective policy check followed by command/exec under unchanged named permissions fails. No turn/token usage or remote role tool call; child/bridge ended and session released. PM, which has no native file tools, skips the command probe. Marker success alone would not certify filesystem isolation. Runtime SHA256 25290638a0df9b9759aa9260162dd4718419b695c2a3fdbc0fb92c8b61bf4ca9. [projected actual observations](../assets/2026-10-04-codex-role-host-preflight/observations.json) | Inline; no raw log retained |
| E76 | Actual current adapter/manual host | 2026-10-04T11:48:55.423Z; revision 6837fe73e802e8c833c335b1dc740acccf814975; Actual model on 2026-10-04T11:48:55.423Z: pending agent_next observed, children 1; simultaneous Claude start locked with same session and unchanged commit/propose false policy. Stop → early release quiescence-required → turn/interrupt after 381ms → turn/completed interrupted → pending HTTP closed → children 0 → release. No outcome submission after stop. Reported tokens 4621. This is fixture-MCP/current-Codex evidence, not actual Claude host or mixed-version handoff acceptance. [projected actual observations](../assets/2026-10-04-codex-role-host-preflight/observations.json) | Inline; no raw log retained |
| E77 | Actual current adapter/manual host | 2026-10-04T11:48:55.423Z; revision 6837fe73e802e8c833c335b1dc740acccf814975; NOT IMPLEMENTED: basic filesystem host gate is blocked, so C4 runner/command/skill and actual 110-minute idle/resumption trial were not started. Local WSL distribution and Docker/Podman are unavailable. User authorization remains recorded; no permission widening, global setup, or automatic-watch guidance substituted for evidence. | Inline; no raw log retained |
| E78 | C0 command/fixture | 2026-10-04T11:56:29.121Z; revision 6837fe73e802e8c833c335b1dc740acccf814975; Session tests 11 PASS; npm test 287 PASS; npm run check PASS (architecture26/project-availability18; lint clean); explicit FSD/architecture PASS; build PASS. Actual report append exposed CRLF evidence-table corruption, fixed by normalizing parsed section text; report tests 27 PASS/1 Windows file-symlink privilege skip/0 failures and final check PASS. Dedicated report structure and git diff --check PASS. [Final source hashes and checks](../assets/2026-10-04-codex-role-host-preflight/checks.json). No new model, DB, package or C4 trial in these commands. | Inline; no raw log retained |
| E79 | Actual WSL2 model-free host | 2026-10-04T12:10:33.969Z; revision 21a1d6eb66cd0e57f94cff87de14b485f321a21e; Actual unchanged product adapter on Ubuntu 26.04.1/WSL2 with native Codex 0.160.0, unprivileged user: preflight/read/scratch write exit 0; out-of-repository synthetic canary read exit 1; repository and Git metadata writes exit 2, read-only filesystem. Scratch contents match; forbidden files absent. Root deny and approval never unchanged. Same binary moved into minimal readable system tools after user-local executable was hidden by bubblewrap. No model turn or remote role call; owned children/bridge ended, locks released. [Linux host observations](../assets/2026-10-04-codex-wsl-host-preflight/observations.json) | Inline; no raw log retained |
| E80 | Actual WSL2 model-free host | 2026-10-04T12:10:33.969Z; revision 21a1d6eb66cd0e57f94cff87de14b485f321a21e; Linux checkout at 21a1d6eb66cd0e57f94cff87de14b485f321a21e: npm ci completed; session 11/11 and report 28/28 pass, zero skips. The Linux report symlink case ran. These are regression tests, not actual winning role/full verifier/CLI approval/watch acceptance. [Linux host observations](../assets/2026-10-04-codex-wsl-host-preflight/observations.json) | Inline; no raw log retained |
| E81 | Actual WSL2 model-free host | 2026-10-04T12:10:33.969Z; revision 21a1d6eb66cd0e57f94cff87de14b485f321a21e; Native Linux CLI is separately awaiting device login; Windows credentials were not copied. Model-free filesystem probes passed but actual role inference/full independent verifier and approved CLI resumption remain unexecuted. C4 runner/skill and 110-minute idle trial remain NOT IMPLEMENTED; authorization persists. [Linux host observations](../assets/2026-10-04-codex-wsl-host-preflight/observations.json) | Inline; no raw log retained |

Existing failures versus new failures: host/environment gaps remain separate from product regressions.
Sensitive-data review: only fixed/projected diagnostics are emitted; raw host output, credentials, session data and environment values are excluded.

Historical E48–E52 uncommitted C0 source SHA256: scripts/rehearse-dual-client-runtime.ts: f1e821ee44b9c0f9df1facafeef40a82bdc8afb01acd0fc7d0fecf3e4108ff5e; scripts/rehearse-dual-client-runtime.test.ts: f7417528786e04b8095af94ab24e86e2bde84799159e7360b69a890143af5a67. E41 onward records actual manual probes and regression commands; earlier rows are retained as historical observations. Verdicts apply to each tested candidate, not all possible Codex environments. No raw credential or conversation transcript is persisted here.

Historical E53–E63 uncommitted product inventory: 59 changed/untracked public files under packages/plugin/scripts/src, sorted path:SHA256 lines hashed as UTF-8, SHA256 4df2ed6f0986d17ed5772163d9a353571aa1c38bbf223116a4a8428834503c91. Includes test/helper/package files; excludes docs and existing unrelated user changes. Private normalized TemplateSource rows: 11, source SHA256 8f495b03563a93d60853602b2fa77e1a52f44246bba32ef6bcd980a5e5a8c1bc; private templates.test.mjs SHA256 687482d0dba9e21420c318220f774e17f902ba495df69a1a167e90e5ad3ac5c0. Snapshot hash uses templateSourceHash/readTemplateSources; no private body is copied into this report.

Final E64–E66 uncommitted source inventory: 59 changed/untracked public files under packages/plugin/scripts/src, same sorted path:SHA256 UTF-8 algorithm, SHA256 4687def83b992fd52ca156e69abfe752e466d877ce3282c02f2d975c1375e8fe. This inventory excludes top-level docs, unrelated user changes and tests/; the new DB test hash is recorded separately in E65. Private source/test hashes remain the E55 values. C3 acceptance runner/report changes supersede the historical script bodies without rewriting their evidence. No source is committed, privately seeded or published.

## Findings and Follow-up

The WSL2 system executable resolves the earlier Linux package-placement failure without granting additional role access. Model-free filesystem host behavior is now observed on Linux; full role/verifier and approved resumption remain prerequisites. No global Windows configuration, credential copy, production seed, or C4 implementation occurred.

Current run: MCP tool approvals are bounded to the existing role allowlist with default prompt; request escalation still refused. The file-role command preflight now fails before inference on the unsupported host. Actual PM pending MCP stop was observed but does not clear BLK-DUAL-01/02/03/05 or watch BLK-DUAL-04. Compatible host basic acceptance is the next dependency; C4 remains authorized but unimplemented. Earlier scope statements below describe their own historical runs.

The public implementation is committed in 771fd41 and integrated with latest dev in E67's revision for a PR targeting dev. The earlier uncommitted inventories describe their historical checkpoints. The separate private template repository remains at 95ace9d70b63cc8598ab229e2fe1138467f11728 with local changes; those bodies are excluded from the public PR and have not been committed, pushed or seeded. Actual installed package, owner skill execution, DB and deployment blockers remain unchanged. Unrelated existing document edits/deletions are excluded from the public commits.

C0 cannot release BLK-DUAL-01/02/03/05 from help/config validation alone. Track unresolved native role isolation, actual winning package body, approved private deployment and mixed-version quiescence in [the follow-up proposal](../../proposals/active/codex-dual-client-runtime-follow-ups.md).

BLK-DUAL-01 remains open: reject the writable-repository automatic approval candidate; test the implemented fresh App Server adapter where repository reads and allowed scratch writes execute while forbidden writes, nested agents and owner tools are actually denied. The new effective config check does not establish functional kernel/tool restrictions. Neither global sandbox reconfiguration nor blanket escalation was performed. Architecture documents now describe implemented source and explicitly distinguish actual product readiness.

BLK-DUAL-02 is partially informed by the unchanged complete owner skill package (8 files, E18/E32), graph-preservation/render tests and bounded seed/restore contracts, including later isolated DB rollback E70; actual verifier execution and approved private bundle deployment/recovery remain untested. BLK-DUAL-03's earlier compatibility fixture passed, while the new source package is not published or installed for full acceptance. BLK-DUAL-05 has local managed/legacy stopping, child settlement and successor fencing tests; actual mixed host pending/quiescence remains unproven. C4 was outside that historical execution scope; the user subsequently authorized it, but the current basic host gate prevents the prescribed next implementation step.

Reproduction: run node --import tsx scripts/rehearse-dual-client-runtime.ts --phase capability --root <new-empty-absolute-root-outside-repository> --report docs/test-reports/active/dual-client-runtime-report.md. The command uses no model and currently exits 2 for required unexecuted checks. It creates native-probe.argv.json/native-probe.prompt.txt and strict-profile-probe.argv.json/strict-profile-probe.prompt.txt, plus separate read-only repository and scratch fixtures. capabilityProbe and isolatedModelEnvironment exports supply the exact generated argument array and sanitized environment for an independently authorized Node spawn. These are explicit prototypes, not production adapters or a model auto-launch interface. The historical automatic approval probe is failure evidence and should not be used for a real repository.

Permission-profile basis: [official permissions documentation](https://learn.chatgpt.com/docs/permissions); named profiles use explicit filesystem permissions without legacy sandbox flags. Packaging basis: [official plugin structure](https://developers.openai.com/plugins/build/plugins#plugin-structure); this fixture intentionally has compatibility manifests and no portable root plugin.json. Configuration/discovery documentation cannot replace runtime boundary measurements.

## Test Data and Cleanup

Initial setup correction: an invalid synthetic hash fixture failed before model/child startup. Its exact owned lock/policy were removed after root/session and empty child/poller checks; fixture source remains. The separate actual trial sessions all released normally.

Current manual trials consumed the native CLI login without copying credentials or forwarding parent HARNESS/owner/API variables. All owned child/bridge processes and locks settled/released. Synthetic fixtures and probe scripts remain in the owned temporary root for reproduction; no production seed, deployment or browser profile change. Three model turns report a total of 66048 tokens; execution preflight starts none. [projected actual observations](../assets/2026-10-04-codex-role-host-preflight/observations.json) contains no credentials, private body or real conversation transcript.

Owned disposable roots retain non-secret fixture source/configuration and synthetic write-failure files for reproduction. C0 loopback listener/App Server inspection processes close before report emission. The manual model trials completed; one earlier network-blocked CLI attempt was stopped by its exact owned PID without targeting unrelated Codex processes. No product/global configuration, production data, real token registration, DB audit or DB seed was changed. The five completed manual probes consumed model usage as recorded in their evidence; the model-free script itself did not.

An earlier writer implementation left its own draft when Windows handle/path dev values differed. After that writer ended, its valid draft was explicitly recovered; the fixed writer compares the actual file identity and never takes over an existing draft automatically. Tests cover failed rename, an unrelated successor temporary file, external report modification and immutable completed-campaign preflight. Current own .tmp is absent after atomic rename/read-back. Tests remove only their explicitly checked owned temporary roots; C0 evidence roots are retained. Required failure history is preserved rather than rewritten as PASS; a future successful alternative must follow explicit report lifecycle/evidence rules.

## Conclusion

Latest decision: remain active/result:null. Bounded WSL2 filesystem behavior passed; actual authenticated role/verifier and approved resumption have not been run. C4 remains unimplemented. Prior required failures are preserved and are not cleared by this narrower PASS.

Current decision: preserve active/result:null. Actual MCP execution/cancellation evidence is partial; Windows functional filesystem gate remains blocked. C4 and the 110-minute idle experiment were not performed. A compatible host must pass the unchanged-role basic acceptance before proceeding.

Result rationale: fail
Required failure: automatic approval candidate wrote the protected disposable repository. Native role selection and strict fresh CLI candidates remain blocked or unproven. Static/unit/build PASS cannot repair these runtime outcomes.
Rerun decision: keep this report active/result:null and the proposal blocked for actual acceptance/release. Local C1–C3 source is implemented under the follow-up instruction. Next run the current product host canary, full verifier, bidirectional approved DB/browser flow, installed package and seed/rollback trials before declaring support ready. Normal CLI login is available and is not the outstanding blocker.

## Review Checklist

- [x] JSON-compatible flat metadata and standard sections used.
- [x] Required gates and Evidence IDs recorded; no fabricated model/DB/browser PASS.
- [x] Fixed/projected diagnostics reviewed for sensitive content.
- [x] Cleanup and retained fixtures documented.
- [ ] Complete actual host isolation, product package, DB flow and mixed-version gates before support/release readiness.
- [ ] Run repository-wide docs:check if it becomes available; currently absent.
- [x] This report uses the dedicated structural validator, which does not replace docs:check.
- [x] Actual model usage, failed candidate writes, authentication-context distinction and legacy stop limits retained.
- [x] Local regression checks and one skipped privilege-dependent test recorded separately from product acceptance.
- [x] C1–C3 source/test hashes, final gates and model-free effective config observation appended without replacing historical runtime outcomes.
