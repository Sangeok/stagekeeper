<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Repository architecture

Before changing application code, read `docs/architecture/README.md` and the linked
document for the area being changed. `docs/architecture/` is the source of truth for
the current repository structure; proposals describe future work and do not override
accepted architecture unless they explicitly update it.

For frontend code, follow `docs/architecture/fsd.md`:

- Keep Next.js route entrypoints and framework composition in `src/app` after the
  approved source-layout migration.
- Keep app-owned fonts, licenses, provenance, and the image font loader together in
  `src/app/_fonts/`. The underscore marks a Next.js private folder excluded from routing.
- Put product frontend code in `src/fsd` and preserve the dependency direction
  `pages -> widgets -> features -> entities -> shared`.
- Import another slice only through its public API. Keep same-layer slices isolated.
- Keep backend application services in `src/server`, app-owned pure policy in
  `packages/app-core`, plugin-shipped shared contracts in `packages/shared`, and
  plugin-only code in `plugin/runtime`. Follow `docs/architecture/shared-modules.md`
  for public entries, runtime boundaries, and generated `plugin/lib` distribution.
- Do not create both root `app/` and `src/app/`; Next.js ignores `src/app/` in that
  state. Until the existing root `app/` is migrated as one operation, do not create a
  parallel `src/app/`.

Before adding, modifying, or moving tests, read and follow
`docs/architecture/test-writing.md` for writing criteria and
`docs/architecture/test-organization.md` for placement. Use
`docs/architecture/verification.md` for execution commands and CI integration.

For test placement:

- Do not put test files or test-only code directly in `src/` (alongside `app/`) or
  directly in `src/app/` (alongside `page.tsx`). Examples of forbidden paths include
  `src/proxy.test.ts`, `src/app/page.test.ts`, `src/app/robots.test.ts`, and
  `src/app/sitemap.test.ts`.
- Do not create test-only directories such as `tests/`, `__tests__/`, or `testing/`
  directly under either directory. This restriction takes precedence over the
  default rule of colocating tests with their target.
- Put product tests beside their owner in `src/fsd` or `src/server`. Put tests of
  framework entrypoints in a responsibility-specific directory under root `tests/`
  and ensure the test command discovers them.

When adding, removing or moving a CI job or a gate leg, update the CI coverage table
in `docs/architecture/verification.md` in the same change. Classify the check as
common (the result does not depend on the OS), per-OS (it can, so it runs on Windows
and macOS) or single-OS (with a reason). Add the job for the other supported OS in
that change, or name the missing OS in the table's unmet cell and leave a follow-up.
`npm run verify:ci-coverage`, part of `npm run check`, compares the workflows with
the table.

Run `npm run verify:fsd`, `npm run verify:server`, `npm run verify:shared`, `npm run test:architecture`, and the relevant lint, type,
test, and build commands before completing a code change. Do not suppress an
architecture error without documenting and approving the exception in
`docs/architecture/verification.md`.

## Code comments

- Do not add explanatory code comments, prose-only JSDoc, or test narration unless
  the user explicitly requests comments. Express intent through names, types, and
  code structure.
- Preserve functional metadata such as required JSDoc type annotations, compiler
  and tool directives, shebangs, generated markers, and license notices. Add such
  metadata only when required by the code or an existing repository contract.
- Keep removal of existing comments within the user's requested task scope.

## Branching and pull requests

`dev` is the integration branch; `main` is the release branch and holds only
commits that were already green on `dev`.

- **Highest priority: never delete local or remote `main` or `dev`.** This overrides
  every cleanup rule. Do not disable or bypass their deletion protection, and never
  include either branch in a deletion command, batch, or wildcard.
- At task start and completion, inspect `npm run pr -- status` from a retained
  control checkout. `complete`, `cleanup` and `retire` act on one registered task.
  `create` for a new task and `npm run pr -- sweep` also examine every registered
  task, as described below. Nothing is removed by age, and unregistered worktrees
  are never examined.
  If activation is absent, use status/inspect/migrate preview only. Actual repository
  migration requires the ADOPT handoff; do not silently activate or invoke retired tools.
- At the start of each independent task, also list the open pull requests
  (`gh pr list --state open`) and read the proposals in `docs/proposals/active/`.
  Another session or machine may be changing the same files, or may own the decision
  you are about to make.
- Before choosing a branch or worktree, state whether the request is read-only,
  a continuation of the current task, or an independent change. Read-only inspection,
  explanation and review do not need a new branch or worktree. Continue the same
  unmerged task's fixes, tests and review responses in its existing branch and
  worktree; a new message alone does not start a new task. Follow the merged-PR rule
  below when the previous task branch has already merged.
- Preserve dirty worktrees and additional commits. Do not stash, discard, force
  checkout, or remove another task's worktree to make cleanup pass. Use an isolated
  worktree for a new task when existing work must be preserved. An owner may release
  its own worktree only through the normal task-end procedure below.
- Before starting an independent change, prepare a retained control checkout with
  the current `origin/dev` tools and rules as described in `docs/architecture/verification.md`.
  Fetching remote refs does not update the executing source. Once activation has been
  explicitly completed, use `npm run pr -- create --owner <owner> --branch harness/<topic>
  --path <absolute-new-path>` there and retain the task ID, instance ID and state OID.
  Existing unregistered worktrees remain unmanaged; never infer ownership from age.
- Keep a managed worktree assigned to its recorded task and branch. Do not switch
  it to another task's branch for reuse; `resume` only continues the same task.
  When moving to a new task after the previous one's use has ended, complete its
  normal closeout procedure first. If preservation or usage checks block closeout,
  retain that worktree and report the reason before isolating the next change.
- Verify that remote `main` and `dev` exist and fetch the latest `dev` before
  creating a new `harness/<topic>` branch. If either protected remote branch is
  missing or cannot be verified, stop branch maintenance and report it.
- Branch from the latest `dev`, named `harness/<topic>`. Never reuse a merged task
  branch for an independent task. Open the pull request against `dev`:
  `gh pr create --base dev`. The repository default branch is `main`, so without
  `--base` the pull request targets the wrong branch.
- Before pushing a follow-up commit to a task branch, confirm with a separate command
  that its pull request is still open (`gh pr view <number> --json state`). When it
  is already merged, start a new branch from the latest `dev` instead: the merged
  branch is deleted, and a push would recreate it outside any pull request.
- A pull request into `dev` merges only when the `check` workflow is green.
- Promote `dev` to `main` by fast-forward only, and name the commit. After
  `git fetch origin`, run `git push origin <sha>:refs/heads/main`, where `<sha>` is the
  full `origin/dev` commit the gates ran on. Git refuses that push unless it is a
  fast-forward. Do not promote through a local `dev` or `main` branch: on another
  machine it can be behind or ahead of the commit that was checked.
  Do not merge `dev` into `main` through the GitHub UI: that merge commit lands on
  `main` alone, and every release after it needs a back-merge to repair the split.
- Before promoting, run `npm run verify:plugin-version` and stop if it fails. When
  shipped `plugin/` files differ between `origin/main` and `origin/dev`, both plugin
  manifests must carry the same, higher version; otherwise the server deploys while
  installed plugins never update. When the commit being promoted is not the tip of
  `origin/dev`, check that commit with `npm run verify:plugin-version -- --head <sha>`.
- Before dispatching a promotion gate (`client-init-smoke`, `agent-eval`,
  `pipeline-smoke`), look up what already ran. `gh run list --commit <sha>` lists the
  runs of the `dev` commit being promoted, and `gh run list --workflow <gate>.yml`
  shows each gate's unfinished runs (any status other than `completed`). Reuse a
  finished green run of that commit instead of dispatching again, but only when its
  inputs match: the run's row in the gate record shows the `templatesCommit` and
  `scenario` it used. While a run of the same gate is unfinished, on any commit, wait
  for it, because a new dispatch on the same branch cancels a running
  `client-init-smoke` or `agent-eval`. `agent-eval` and `pipeline-smoke` use the same
  subscription, so also wait for either one before dispatching the other. When a gate
  job has been running for more than 30 minutes, tell the user and then cancel that
  run. Dispatch a gate only when the commit has no finished run of it with those
  inputs, or that run is not green.
- `client-init-smoke` and `pipeline-smoke` install the plugin from the tip of the
  `dev` branch and fail with `installed marketplace commit <sha> is not the commit
  under test` when that tip is no longer the commit they were dispatched on. Dispatch
  them only when no pull request into `dev` is about to merge, and merge nothing into
  `dev` until every leg of both has passed its `plugin-install` step. A run that
  failed this way says nothing about the commit: write that cause in its `[gate]`
  issue, close it, and dispatch again on the commit to promote.
- Every gate run on `dev` or `main` that was dispatched by hand or by schedule adds a
  row to the gate record (https://github.com/Sangeok/stagekeeper/issues/319). It also
  opens a `[gate] <workflow> <commit>` issue when the gate failed, a summary is
  missing, or a summary shows a nonzero `harnessErrors` or `stepRefusals`. Before
  promoting, read the rows of the commit being promoted. Stop while a `[gate]` issue
  for that commit is open: write the cause and the decision in it and close it first.
  Read the other open `[gate]` issues too, and stop when one concerns a change in this
  promotion. When only the `record` job of a gate run failed, re-run that job; it
  reuses the gate job's outputs and starts no model.
- A post-merge run on `dev` or `main` that fails is rerun once by the
  `post-merge-failure-record` workflow, and the failure and the rerun result are
  recorded in a `[post-merge] <workflow>/<job>: <step>` issue. Triage that issue.
  When the merged change caused the failure (it changed the failing test or the code
  that test uses, and the rerun failed too), revert it first through a pull request
  and fix it afterwards. When an unrelated test failed and the rerun passed, or the
  issue collects different commits, fix the test; the count in the issue sets the
  order. When the failure is outside the tests, such as a runner that did not start,
  confirm that the rerun passed. Write the cause and what was done in the issue, then
  close it; the workflow never closes one.
- Before promoting, read the open `[post-merge]` issues. Stop while one concerns the
  commit being promoted or a change in this promotion: write the cause and the
  decision in it and close it first. After `git fetch origin`,
  `npm run find:green-dev` prints the newest `origin/dev` commit whose post-merge
  workflows all passed and the newer commits it leaves out.
- Before promoting, run the `client-init-smoke` workflow on the `dev` commit being
  promoted (`gh workflow run client-init-smoke.yml --ref dev`), and also `agent-eval`
  when shipped `plugin/` files changed. Stop unless every job is green, and promote
  only the commit their summaries name. Both check plugin installation and init
  only; neither runs the pipeline.
- Before promoting, confirm a green `shared-distribution-acceptance` run on the `dev`
  commit being promoted (`gh run list --workflow shared-distribution-acceptance.yml
  --commit <sha>`). It installs and updates the real Codex bundle on Windows and macOS
  without a model. When that commit has no green run, dispatch it
  (`gh workflow run shared-distribution-acceptance.yml --ref dev`) and promote only the
  commit the run checked. Stop unless every leg is green; rerun once only when a leg
  failed for a cause outside the change, such as a runner that did not start. This
  workflow has no `record` job, so its result is not in the gate record.
- Codex model CI does not block promotion yet. When the gate record has no Codex
  `eval` or `pipeline` row for the commit being promoted, say in the promotion report
  that Codex model behavior is unverified at that commit. Do not add such a note to
  the gate record; it holds one row per run.
- Before promoting, also run the `pipeline-smoke` workflow on that `dev` commit
  (`gh workflow run pipeline-smoke.yml --ref dev`) when
  `git diff --name-only origin/main origin/dev -- src/server/pipeline src/server/agents src/server/mcp packages/app-core/pipeline packages/shared/templates src/server/templates/release-preparation.ts src/server/templates/release-preparation.test.ts src/server/templates/runbook-query.ts tests/server/runbook-stale.test.ts plugin/skills/watch plugin/skills/background plugin/bin/harness-watch.mjs plugin/bin/harness-session.mjs plugin/bin/harness-background.mjs plugin/bin/harness-commit-guard.mjs plugin/hooks plugin/runtime plugin/lib/execution scripts/rehearsals/rehearse-client-init-smoke.ts scripts/rehearsals/support scripts/rehearsals/client-init scripts/rehearsals/pipeline scripts/rehearsals/agent-eval scripts/rehearsals/agent-eval-summary.mjs scripts/rehearsals/rehearsal-compatibility.test.mjs scripts/checks/rehearsal-boundaries.test.mjs scripts/rehearsals/rehearse-pipeline-smoke.ts scripts/rehearsals/pipeline-smoke-steps.mjs scripts/rehearsals/smoke-server.mjs scripts/rehearsals/smoke-server-listener.cjs scripts/rehearsals/rehearse-codex-macos.mjs scripts/rehearsals/codex-init-eval.mjs scripts/rehearsals/client-ci-contract.mjs scripts/rehearsals/client-init-smoke-steps.mjs scripts/rehearsals/gate-environment.mjs scripts/rehearsals/gate-record.mjs scripts/windows/package-windows-plugin.mjs scripts/macos/package-plugin.mjs .github/actions/gate-record .github/workflows/pipeline-smoke.yml .github/actions/smoke-database`
  prints a file. Run it with `--field templates-ref=<templates branch>` before seeding
  a role-template change to production. When `agent-eval` is also needed, dispatch
  `pipeline-smoke` after it finishes, because both use the same subscription. It runs
  one backlog item from assignment to acceptance with a real model and the background
  runner. Stop unless it is green; rerun it once only when its summary shows a cause
  outside the change, such as a model API error or a runner that did not start.
  When a green summary shows a nonzero `harnessErrors` or `stepRefusals`, open the
  sealed transcripts before promoting, and fix the contract, hint or template wording
  first when it caused the refusal.
- Before promoting, check the production database's migrations; `npm run build`
  only generates the Prisma client. The local `.env` `DATABASE_URL` must point at a
  development database, never production, because `npm run db:migrate` changes its
  schema immediately. Pass the production connection string explicitly, for example
  `node --env-file=<production env file> node_modules/prisma/build/index.js migrate status`,
  and keep that file outside the repository. Apply pending migrations with
  `migrate deploy` before the `main` push. When a pending migration is not
  backward-compatible with the deployed `main` (it drops or renames objects or
  rewrites existing rows), run `migrate deploy` and the `main` push back to back.
- After the `main` push, confirm that production serves that commit. Wait until
  `gh api repos/Sangeok/stagekeeper/commits/<sha>/status --jq '.statuses[] | select(.context == "Vercel") | [.state, .target_url] | @tsv'`
  reports `success`. The deployment id is the last path segment of that `target_url`,
  and `curl -s https://stagekeeper.dev | grep -o 'dpl_[A-Za-z0-9]*' | sort -u` must
  print `dpl_` followed by the same id. A different id means production still serves
  an older deployment.
- **Neither `main` nor `dev` may be the head of a pull request.** Release promotion
  remains fast-forward only. The active GitHub ruleset `Keep dev and main` forbids
  deletion and force pushes of both protected refs. The active ruleset
  `Require pull request on dev` accepts a change to `dev` only through a pull
  request, so a direct push to `dev` is refused. Neither ruleset has bypass actors;
  retain that protection.
- Feature branches are deleted automatically when their pull request merges
  (`deleteBranchOnMerge` is on). That is intended — it keeps `harness/<topic>` branches
  from piling up — and `gh pr merge` needs no `--delete-branch`.
- A task completes after its exact PR head is merged into `dev` and the merge commit
  is verified in fresh dev history. Merge only within the user's authorized scope;
  never merge merely to enable cleanup. `complete` checks the latest exact-head
  `check.yml` run, required checks and GitHub readiness before its one merge request.
  Remote feature-branch deletion remains GitHub's responsibility.
- At task end, finish processes and shared use, preserve ignored user data, and move
  outside the target to a trusted control checkout. Read `pr -- inspect --task <id>`.
  An authorized merge uses `npm run pr -- complete --task <id> --owner <owner>
  --expected-state <oid> --expected-head <sha> --expected-instance <uuid>
  --request-id <uuid> --pr <number> --usage-ended`. Owner strings are not authentication.
  Unknown ownership, dirty files, locks, foreign filesystems or external links preserve
  the worktree. Ignored build caches are allowed only within the documented boundary.
  The two Next build directory links for pg and @prisma/client described in
  verification.md do not block the merge handoff when both ends are ignored,
  untracked, in this worktree and on its filesystem. Automatic removal accepts them
  only on the verified Darwin 25.2.0 arm64 / Node v26.4.0 non-root profile with
  Apple Git 2.50.1 (Apple Git-155). On every other host, Windows junctions included,
  the merged task stays `cleanup-pending` with `linked-path`. Other directory links
  and junctions block the handoff. Do not pre-delete caches or links. On Windows,
  run the manager with Node v22.23.4 or later. A Node that reports device 0 for
  ordinary directories runs only status and inspect (`device-identity-unavailable`).
- Automatic worktree removal requires the runtime's fresh qualified/clear/complete/settled
  observation. Windows and unqualified/unknown/busy results retain both the worktree
  and branch as `cleanup-pending`. A merged PR can therefore remain locally pending.
  The registered runtime profile is not expanded by a caller flag or test result.
- A person may merge a task's pull request on GitHub without running `complete`.
  The next `create` for a new task, or `npm run pr -- sweep`, removes such a task's
  worktree and local branch only when all of this is confirmed in that call: the
  pull request is merged into `dev` after the task started, the local branch and
  worktree are at the merged head, the removal file check passes, the usage
  observation is qualified and clear, and the remote branch was not reused. It sends
  no merge request and takes no owner or usage declaration. A task that fails a
  check keeps its ledger unchanged and is listed with its path and reason in
  `sweep.results`; report the removed and the held tasks after `create`. A task
  whose worktree is already gone is left to `inspect` and `cleanup`. A held task
  does not stop the new task from being created.
- `cleanup` takes task/owner/expected-state/head/instance/request-id and continues only
  existing merged or retire authority. `recover` records observed effects without
  another merge or deletion. A transport-unknown merge request is never retried from
  OPEN alone. `resume` can cancel only an intact seal before any merge request.
- If the user explicitly reports external removal, `acknowledge-removal` takes the
  same task effect inputs and `--external-removal-confirmed`. It verifies full
  path/admin/registry absence and records a receipt only. A later `cleanup` may remove
  the remaining branch after fresh checks, including on Windows. Never infer that
  report from a generic instruction to proceed, and never turn unknown usage into clear.
  A manual removal unlinks the two build links first and never deletes recursively
  through a link or junction.
- `retire` is explicit closeout for no PR or a closed unmerged PR. It proceeds only
  when the task head is preserved: either it is an ancestor of fresh dev, or the
  remote branch of the same name, read in that call, is at the same commit. Otherwise
  it refuses with `head-not-preserved`. Open/dependent PRs, reused remote refs and
  additional commits preserve the branch. Already merged work remains on the merged
  path. `retire` does not push and never deletes the remote branch; `create` and
  `sweep` never retire a task.
- When a task ends without a merge (the user stops it, its pull request is closed
  unmerged, or other work replaces it), ask the user whether to close it with
  `retire`, and say so when its commits must first be pushed to the remote branch.
  Push and run `retire` only after the user approves it for that task; a generic
  instruction to proceed is not that approval. Without approval, retain the worktree
  and branch and report the path and reason. Ask the same about an unmerged task that
  `create` or `sweep` reports as held.
- `recover-guard --guard common|task|migration` is read-only unless a known dead owner,
  its exact nonce and `--confirmed-quiescent` are supplied. Task scope also requires
  `--task`. Live, unknown and foreign-host guards are preserved. The legacy migration
  fence is never a recover-guard target. Do not kill processes by name or force removal.
- State is held in local `refs/stagekeeper/pr-closeout/` Git commits, with first-parent
  CAS history and source/merge pins. Do not push, edit or prune those refs manually.
  Existing task effects require the current state OID; identical request replay uses
  its saved original inputs. `main` and `dev` can never be deletion inputs.
- Do not use retired managers, `git branch -D`, ad hoc ref deletion, age, a missing
  remote branch or `git branch --merged` as a cleanup fallback. Inactive metadata,
  failed evidence, partial removal and reappearing paths preserve data for inspection.
- Report merge preservation, worktree outcome and branch outcome separately, including
  the retained path and reason. A continuing task keeps its worktree; do not declare
  usage ended while follow-up work, processes or other users still need it.
- Do not commit directly to `dev` or `main`.
