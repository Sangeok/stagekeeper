# Windows runtime cache — implementation verification

Date: 2026-10-05 UTC. Scope: runtime reuse in `windows-role-runtime` and repair
of the hosted Git worktree binding failure, not deployment or certification of
hosted cross-PR cache timings.

## Result

Local verification passed. Finished runtime files replace the source/intermediate
cache. `dev` pushes populate a base-branch cache; PRs use the exact recipe/contract
key, verify restored files before execution, and retain fresh Windows acceptance.
Missing caches compile the pinned source. Partial matches or failed integrity
checks stop. Same-PR replacement runs cancel older work; active `dev` work finishes.

## Checks

| Check | Result |
| --- | --- |
| Runtime cache contract tests | 18 passed: valid package without execution, recipe/contract invalidation, application independence, LF/CRLF stability, provenance mismatch, file corruption/addition, missing files, aliases/hardlinks, size/depth limits, invalid CLI |
| `npm run check` | Passed before and after rebase; lint, FSD, route type generation, TypeScript, architecture and project-availability checks |
| `npm run verify:fsd`, `npm run test:architecture` | Passed; architecture: 44 passed, 2 conditional native skips; those native tests passed in the dedicated Windows run |
| `npm test` | 307 passed, 2 existing conditional skips on base `af88938` plus this implementation |
| `npm run test:web` | 576 passed on the same implementation |
| `npm run build` | Passed; normal production build with generated Prisma client and no project `.env`/DB credentials |
| Actual Windows role/file/readlink/IPC acceptance | 22 passed, no skips; prepared runtime set explicitly |
| Latest `dev` Git acceptance after rebase | 12 passed, no skips |
| Git binding regression with real Windows 8.3 TEMP and Git 2.55 | Failure reproduced before the fix; 12 passed after the fix, including short/long spelling equivalence and foreign-repository/junction refusal |
| Updated token-reveal regression after rebase | 8 passed |
| Network-denied actual Windows full project build | Passed: exit 0, quiescent, untruncated output, snapshot writes discarded, original repository/build identity unchanged |
| actionlint 1.7.12 | Passed on final workflow; official release archive checksum verified |
| PowerShell builder syntax and fingerprint | Passed; PowerShell and runner Node produce the same normalized SHA-256 |

The isolated branch started from `af88938` and was rebased onto `38ebaa9`
(merged #117). The rebase preserved Git test triggers and the native Git command
in the workflow; check/actionlint, Git acceptance and its changed UI regression
were rerun. Application source and runtime build recipe were unchanged by #117.

## Hosted observations and Git binding repair

The first hosted cache implementation run
[37315941150](https://github.com/Sangeok/stagekeeper/actions/runs/37315941150)
compiled the pinned runtime successfully in 47m 23s, passed runner-Node integrity
verification and child-process smoke, and saved a 33,840,992-byte runtime cache.
Its later native acceptance failed at the existing Git worktree binding test;
the runtime compile, integrity verification and cache save all succeeded.

The diagnostic retry
[37327849104](https://github.com/Sangeok/stagekeeper/actions/runs/37327849104)
restored the exact cache in 3s, skipped compilation and passed integrity/smoke in
1s. Its fixture diagnostics established that Windows TEMP used `RUNNER~1`, while
Git recorded the same ancestor as `runneradmin`. JavaScript realpath preserved
the short spelling; comparing those strings incorrectly rejected the binding.
The same failure was reproduced locally with Git 2.55.0.windows.5 and a real
owned 8.3 temporary path before changing production code.

The fix compares native realpaths only after the existing ancestor/link checks
on both common-directory chains. Tests cover both short and native spellings of
the same worktree binding, a different repository, and a junction/symlink binding
to the same repository. Existing file scope, object alias/hardlink rejection,
configuration isolation and lifecycle checks remain enforced. Latest `dev`
(`7441af0`) was merged into the PR branch; `npm run check` and the application
production build passed on that base. Full hosted acceptance is rerun on
[PR #119](https://github.com/Sangeok/stagekeeper/pull/119) after this repair.

## Runtime material and limits

The local runtime came from successful hosted run
[37293546260](https://github.com/Sangeok/stagekeeper/actions/runs/37293546260),
artifact `windows-role-node-x64` (38,134,969 compressed bytes). Its original
manifest was backed up outside the package. Only the new additive
`buildScriptSha256` field was attached to disposable local test material; the
Node executable, npm and license stayed unchanged. This is not a fresh build of
the revised builder and was not uploaded as a CI cache or release.

Runner-Node verification covered 2,150 package files, approximately 98.6 MB:

- Executable SHA-256: `c5f2967a9b5ccdb33cbaaaf0da78d0f7c2a87c448602dd67060c6d6b4e7a158d`
- Package SHA-256: `ae08b7bc24d529325068edf465bf5ed549d22fd9a804310e18dbe09e79f883c9`
- Normalized build script SHA-256: `3a4b9bf84ac384de1b610e445dbb5504f796c9ed19482ee018138a193559ab38`
- Cache key: `windows-role-node-runtime-v2-windows-2022-x64-3ae9500b11fa6275edc0752ac09eceef2678cb7603731aae01a5c214a7b6f20d`

The full offline rehearsal copied 33,927 files / 766,298,733 bytes into its owned
snapshot, omitted `.git` and `.next`, built with the existing Windows Webpack
compatibility path, and preserved original files. No model, production database,
template seed, plugin installation or release was performed.

Fresh hosted compilation of the new provenance field and same-PR warm-cache
skipping were observed above. A new PR's reuse of the `dev` cache can only be
observed after this workflow is merged and a `dev` push creates the new key.
The first compile and cache eviction/expiry still incur full compilation cost.
Already-running workflows keep their original definition.
