---
status: "completed"
stage: null
result: "pass"
report-kind: "regression"
report-size: "compact"
test-levels: ["static", "contract", "integration"]
test-tools: ["Node.js", "npm", "Next.js", "Prisma", "Windows LPAC", "GitHub Actions"]
created-at: "2026-10-05"
completed-at: "2026-10-05"
last-executed-at: "2026-10-05T09:16:13.165Z"
tested-revision: "72141512408454276316103f0e8c9b0091cd841e"
owners: ["user:Sangeok"]
related: ["docs/architecture/verification.md", "docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/test-reports/active/dual-client-runtime-report.md"]
primary-area: "harness/windows-project-build"
observed-environments: ["local | full public project in disposable LPAC snapshot | native Windows, bundled Node 22.23.3/x64 | plan-verifier", "CI | complete offline project build in LPAC snapshot | Windows Server 2022, pinned Node 22.23.3/x64 | GitHub Actions", "CI | source checks and host production build | Ubuntu, Node 22 | GitHub Actions"]
test-summary: "pass: full Windows project build — no role network or DB URL, original files unchanged"
follow-up: ["https://github.com/Sangeok/stagekeeper/pull/113", "docs/proposals/active/codex-dual-client-runtime-follow-ups.md"]
---

# Native Windows full project build

## Summary and Decision

The final Windows Server 2022 run on checkpoint
`72141512408454276316103f0e8c9b0091cd841e` passed the full offline LPAC build,
including type checking, original source/build-ID assertions and quiescence.
An intentional number-to-string error also failed the configured build in a
separate actual LPAC trial. [Final API/CI observations](../assets/2026-10-05-windows-project-build/typescript-api-observations.json)
preserve the earlier Server spawn failures and the invalidated local candidate.
The completed result certifies this repository build regression on the stated
environments; service minimum setup, released packages and C4 remain separate.

The actual `role_command_exec` build completed compilation, TypeScript checking,
15 static pages, build tracing and the complete route table. It exited 0 with
acknowledged child quiescence. Source hashes and the original build ID remained
unchanged; snapshot writes were discarded. This closes the tested repository's
offline build failure after normal dependency preparation. It does not certify
service installation/resumption, arbitrary native Rust tools, release or C4.

## Scope and Criteria

| Criterion | Source | Priority | Success condition |
| --- | --- | --- | --- |
| R1 | [Verification architecture](../../architecture/verification.md) | MUST | Full build without DB URL/network/environment copies or original writes |
| R2 | [Runtime follow-ups](../../proposals/active/codex-dual-client-runtime-follow-ups.md) | MUST | Retain native kernel denials, source guards, command limits and whole-job acknowledgement |
| R3 | AGENTS.md | MUST | Relevant lint/types/FSD/architecture/tests and host production build pass |

Project dependencies were installed by normal `npm ci` with empty user/global npm
config paths in a public-source-only fixture. Its 524 packages include Prisma's
postinstall schema engine. A regular-file dependency copy prepared the final
checkout; no auth, environment, Git metadata or original build artifacts were
copied. Installation is a developer/CI prerequisite outside the untrusted role,
not a network grant or extra Stagekeeper installation requirement for users.

## Test Target and Preconditions

The initial local runtime used the previously accepted official Node/libuv
build: executable SHA-256 `e9db844fb5645759122c8a9954793c4ce40ea354e3a329fd9f504b0b59f6208f`,
whole runtime `90e2f6d8df5d0b806d20ea7c256ab467c0bec22a3daa4f3f0fd8732c7d9effc4`.
Exact final source hashes and earlier failed candidates are in
[projected observations](../assets/2026-10-05-windows-project-build/observations.json).
The source checkpoint predates documentation and whitespace-only license
normalization; executable source and font bytes are unchanged by those edits.

No model, service registration, browser approval, DB connection, private template,
WSL or new login was used. No original/global ACL or authentication configuration
was changed. All preparation/runtime fixtures are outside Git.

The final Server executable/package hashes are
`c60a4fb5d7a4d313b80c839d58cc8b99ab9f07a7c3acb037ffe11943f4688179` /
`b40b942bc2376223ed67c47291a65075bfaef6775ac44632fc318fad65668e48`.
They are a CI rebuild of the same pinned source/backport. The independent service
trial is documented in E107 of the active runtime report; it is outside this
model-free build campaign.

## Test Matrix

| ID | Criterion | Gate | Scenario | Actual/evidence | Verdict |
| --- | --- | --- | --- | --- | --- |
| T1 | R1/R2 | required | Fresh full LPAC build with no DATABASE_URL/network | 33,883 files, 764,278,078 bytes; exit 0, quiescent, no truncation; compile 13.1s/type check 24s, 2 workers; completed route table | PASS |
| T2 | R2 | required | Original source/build-ID read-back, snapshot cleanup | Script assertions passed; `originalRepositoryWrites:false`, `snapshotWrites:discarded` | PASS |
| T3 | R2 | required | Native command isolation and stopping | Existing 20 tests passed with the same runtime/helper; no skips | PASS |
| T4 | R2 | required | Actual LPAC readlink API semantics and denials | New test passed sync/callback/Promise/ESM, callback validation and external metadata/data denial | PASS |
| T5 | R1 | required | DB command without URL | `prisma migrate status` exited 1 with "Connection url is empty" before any connection; no migration performed | PASS |
| T6 | R3 | required | Source/host regression gates | `check` including FSD/lint/types, architecture 26 PASS/1 platform skip, project availability 18; strict Next config JS types, web 576 and default host build PASS | PASS |
| T7 | R3 | required | Source CI including DB-URL-free build | [check run 37265022165](https://github.com/Sangeok/stagekeeper/actions/runs/37265022165), SUCCESS | PASS |
| T8 | R2 | informational | New Windows Server runtime rebuild/full-project CI | [run 37265022163](https://github.com/Sangeok/stagekeeper/actions/runs/37265022163) still running at evidence capture; not counted as PASS | NOT RUN |
| T9 | R1/R2/R3 | required | Final full Windows Server build with compiler API | [run 37287612001](https://github.com/Sangeok/stagekeeper/actions/runs/37287612001), SUCCESS; 33,889 files/764,338,530 bytes, compile 11.8s/type check 11s, 15 pages/traces/routes, exit 0/quiescent/peak 9, original source/build ID assertions PASS and outputs discarded | PASS |
| T10 | R3 | required | Type checking remains fail-closed | Actual LPAC build rejected the deliberately added number-to-string error; exit 1/quiescent, expected file/diagnostic checked, own canary removed | PASS |
| T11 | R3 | required | Final source/config checks | [check 37287612166](https://github.com/Sangeok/stagekeeper/actions/runs/37287612166), SUCCESS; local config ESLint/strict JS types/FSD, architecture 26 PASS/2 unprepared-native skips | PASS |

The architecture skip is the native test without its explicitly prepared runtime;
T4 runs that test separately on actual native Windows. No architecture exception
or type-check bypass was added.

### Subsequent Windows Server observation

The final documentation checkpoint `0017d385a2cb580203200b762da6450d2b13eac7`
passed [check CI](https://github.com/Sangeok/stagekeeper/actions/runs/37265467065).
Its [Windows Server run](https://github.com/Sangeok/stagekeeper/actions/runs/37265467066)
completed on 2026-10-05T05:49:05Z with a failure in the full-project build:
Prisma generation and the 21 native command/readlink tests passed, but Next.js
reported `spawn EPERM` before compilation finished. The job exited 1, acknowledged
quiescence (peak 6 processes) and discarded its snapshot without original writes.
The local T1 pass remains an observation of that local runtime/environment.
At that checkpoint Windows Server acceptance remained unresolved. Opt-in
fixed-field spawn diagnostics and a silent IPC fork regression were added to
identify the failure; final T9 subsequently resolves that build gate.

A diagnostic candidate used two `NODE_OPTIONS --require` entries. Local compilation
and type checking passed, but Next's worker option serialization merged the paths
and page collection failed with `MODULE_NOT_FOUND`; the job exited 1 and acknowledged
quiescence. The diagnostic is now loaded from the existing single preload entry.
Both actual LPAC IPC/denial and readlink tests passed after that correction. This
failed candidate is distinct from the Windows Server `spawn EPERM` observation.

The corrected checkpoint `6c5c57adab694a1d10213467a15d85f445d7d454`
also passed a fresh local full LPAC build on 2026-10-05T08:07:51.639Z:
33,884 files/764,280,480 bytes, compilation 16.4s, type checking 27.4s,
15 static pages and full tracing/route table. Exit 0, peak 8 processes,
acknowledged quiescence, original source/build ID unchanged and discarded outputs
were asserted. The diagnostic produced no spawn failure. Source content matches
the committed checkpoint (exact font bytes; LF/CRLF-normalized text), with both
tested-byte and committed-blob hashes in [single-preload observations](../assets/2026-10-05-windows-project-build/single-preload-observations.json).
Source CI [37281300745](https://github.com/Sangeok/stagekeeper/actions/runs/37281300745)
passed; its native Server rerun remains separate from this local result.

The diagnostic Server runs on `20c7243` and `0bda715` failed with a current-node
spawn using ignored stdin, seven arguments and no IPC. The installed Next 16.3.3
`runTypeScriptCli` source uses that shape for `tsc --showConfig`; silent IPC
forks passed on those same Server jobs. Upstream [libuv stdio implementation](https://github.com/nodejs/node/blob/v22.23.3/deps/uv/src/win/process-stdio.c)
opens NUL for ignored standard streams. NUL access is the inferred lower-level
cause, not a separately granted or measured permission. The supported
`experimental.useTypeScriptCli:false` selects the existing TypeScript 5.9.3 API
in a piped worker only for Windows role snapshots. The final T9/T10 results
confirm successful compilation and retained type-error rejection; no spawn
option, device ACL, runtime helper or kernel policy was weakened. The optional
Prisma detached child remained refused in Server diagnostics while generation
and the complete build succeeded.

A local API candidate compiled/type-checked/generated/traced successfully and
acknowledged quiescence, but its source-invariance assertion failed: the operator
copied a comment change into the fixture during execution. This is recorded as
an invalidated trial, not a complete regression PASS. Final T9 ran the immutable
committed checkout; T10 independently checked the expected type error.

## Findings and Follow-up

The earlier fixture omitted Prisma's postinstall engine, and Google fonts were
downloaded during builds. Normal dependency preparation, optional build-time DB
URL and pinned local licensed fonts remove those dependencies from the role build.

Actual later trials exposed additional platform restrictions: SWC's TS config
loading and Turbopack's Rust path canonicalization failed on DOS-volume queries;
Webpack then encountered EPERM for non-link readlink calls. `next.config.mjs`,
Webpack's existing alias resolver and the narrowly checked build-process preload
avoid those failures without changing kernel access. Genuine links and failed
metadata checks retain their errors. The first successful compile/type/static
generation still timed out while tracing with 21 workers; two workers and no
discarded-tree cache completed within the unchanged 120-second command limit.

The initial wrapper incorrectly resolved Prisma's package-root types entry; the
exported CLI entry fixed it. All failed candidates remain in projected evidence,
including exit status/quiescence. Next loader customization is not covered by
semver: the current 16.3.3 shape is checked fail-closed and full native CI protects
future upgrades. Default host builds retain Turbopack.

The Windows compiler API selection is supported by the installed Next guide
`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/useTypeScriptCli.md`.
API-less TypeScript upgrades require a new validated role-build approach; the
build must fail rather than skip type checking. Repository `check` also retains
its full project TypeScript check.

## Test Data and Cleanup

All actual role jobs acknowledged quiescence, including the 26-process timeout.
Owned role snapshots were discarded after acknowledgement; original fixture
hashes/build ID were checked. Preparation fixtures and diagnostic probes remain
outside Git for reproduction. Public evidence excludes raw logs, user paths,
auth/session data and private template/skill contents.

## Review Checklist

- [x] Scope, prerequisites, failed candidates and exact tested source recorded.
- [x] No runtime/source-only PASS promoted to service or release readiness.
- [x] Native limits, denials, original bytes and acknowledged cleanup checked.
- [x] Final Windows Server CI confirmed; remaining service/C4 work linked separately.
